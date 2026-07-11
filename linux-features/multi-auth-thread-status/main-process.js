"use strict";

const fs = require("node:fs");
const path = require("node:path");
const IPC_CHANNEL = "codex_linux:multi-auth-thread-status";
const STATUS_FILE = "runtime-rotation-app-bind-status.json";
const MAX_STATUS_AGE_MS = 30 * 60 * 1000;
const SESSION_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;

function sanitizeWindow(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const key of ["usedPercent", "windowMinutes", "resetAtMs"]) {
    if (typeof value[key] === "number" && Number.isFinite(value[key])) result[key] = value[key];
  }
  return result;
}

function sanitizeThreadStatus(value, now = Date.now()) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Number.isInteger(value.accountNumber) || value.accountNumber < 1) return null;
  if (
    typeof value.accountDisplay !== "string" ||
    value.accountDisplay.length > 200 ||
    !value.accountDisplay.startsWith(`Account ${value.accountNumber}`)
  ) return null;
  if (
    value.maskedEmail !== null &&
    (typeof value.maskedEmail !== "string" ||
      value.maskedEmail.length > 160 ||
      !value.maskedEmail.includes("***@") ||
      value.accountDisplay.includes(value.maskedEmail) === false)
  ) return null;
  if (
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt <= 0 ||
    now - value.updatedAt > MAX_STATUS_AGE_MS ||
    value.updatedAt - now > 60_000
  ) return null;
  return {
    accountNumber: value.accountNumber,
    accountDisplay: value.accountDisplay,
    maskedEmail: value.maskedEmail,
    primary: sanitizeWindow(value.primary),
    secondary: sanitizeWindow(value.secondary),
    updatedAt: value.updatedAt,
  };
}

function readThreadStatusFromFile(statusPath, sessionId, now = Date.now()) {
  if (!SESSION_PATTERN.test(sessionId ?? "")) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    return sanitizeThreadStatus(parsed?.threadStatuses?.[sessionId], now);
  } catch {
    return null;
  }
}

function injectedMainSource() {
  return [
    `const codexLinuxMultiAuthElectron=require(\`electron\`),codexLinuxMultiAuthFs=require(\`node:fs\`),codexLinuxMultiAuthPath=require(\`node:path\`);`,
    `const codexLinuxMultiAuthStatusChannel=\`${IPC_CHANNEL}\`;`,
    `function codexLinuxMultiAuthStatusPath(){let e=process.env.CODEX_MULTI_AUTH_DIR?.trim()||codexLinuxMultiAuthPath.join(process.env.HOME||codexLinuxMultiAuthElectron.app.getPath(\`home\`),\`.codex\`,\`multi-auth\`);return codexLinuxMultiAuthPath.join(e,\`app-bind\`,\`${STATUS_FILE}\`)}`,
    `function codexLinuxMultiAuthStatusWindow(e){if(e==null||typeof e!==\`object\`||Array.isArray(e))return{};let t={};for(let n of[\`usedPercent\`,\`windowMinutes\`,\`resetAtMs\`])typeof e[n]===\`number\`&&Number.isFinite(e[n])&&(t[n]=e[n]);return t}`,
    `function codexLinuxMultiAuthThreadStatus(e,t=Date.now()){if(e==null||typeof e!==\`object\`||Array.isArray(e)||!Number.isInteger(e.accountNumber)||e.accountNumber<1||typeof e.accountDisplay!==\`string\`||e.accountDisplay.length>200||!e.accountDisplay.startsWith(\`Account \${e.accountNumber}\`))return null;if(e.maskedEmail!==null&&(typeof e.maskedEmail!==\`string\`||e.maskedEmail.length>160||!e.maskedEmail.includes(\`***@\`)||!e.accountDisplay.includes(e.maskedEmail)))return null;if(typeof e.updatedAt!==\`number\`||!Number.isFinite(e.updatedAt)||e.updatedAt<=0||t-e.updatedAt>${MAX_STATUS_AGE_MS}||e.updatedAt-t>6e4)return null;return{accountNumber:e.accountNumber,accountDisplay:e.accountDisplay,maskedEmail:e.maskedEmail,primary:codexLinuxMultiAuthStatusWindow(e.primary),secondary:codexLinuxMultiAuthStatusWindow(e.secondary),updatedAt:e.updatedAt}}`,
    `function codexLinuxReadMultiAuthThreadStatus(e){if(typeof e!==\`string\`||!${SESSION_PATTERN.toString()}.test(e))return null;try{let t=JSON.parse(codexLinuxMultiAuthFs.readFileSync(codexLinuxMultiAuthStatusPath(),\`utf8\`));return codexLinuxMultiAuthThreadStatus(t?.threadStatuses?.[e])}catch{return null}}`,
    `function codexLinuxMultiAuthTrustedStatusSender(e){let t=e?.senderFrame?.url??e?.sender?.getURL?.()??\`\`;return typeof t===\`string\`&&(t.startsWith(\`file://\`)||/^https?:\\/\\/(?:127\\.0\\.0\\.1|localhost)(?::\\d+)?(?:\\/|$)/.test(t))}`,
    `codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthStatusChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthStatusChannel,async(e,t)=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxReadMultiAuthThreadStatus(t):null);`,
  ].join("");
}

function applyMainProcessPatch(source) {
  if (source.includes("codexLinuxReadMultiAuthThreadStatus")) return source;
  const marker = "exports.runMainAppStartup=";
  if (!source.includes(marker)) {
    console.warn("WARN: Could not find main-process startup export for multi-auth thread status");
    return source;
  }
  return source.replace(marker, `${injectedMainSource()}${marker}`);
}

function applyPreloadPatch(source) {
  if (source.includes("getMultiAuthThreadStatus")) return source;
  const needle = /getFastModeRolloutMetrics:async ([A-Za-z_$][\w$]*)=>([A-Za-z_$][\w$]*)\.ipcRenderer\.invoke\(([A-Za-z_$][\w$]*),\1\),/;
  const match = source.match(needle);
  if (match == null) {
    console.warn("WARN: Could not find preload Electron bridge for multi-auth thread status");
    return source;
  }
  const [original, argumentVar, electronVar] = match;
  return source.replace(
    original,
    `${original}getMultiAuthThreadStatus:async ${argumentVar}=>${electronVar}.ipcRenderer.invoke(\`${IPC_CHANNEL}\`,${argumentVar}),`,
  );
}

module.exports = {
  applyMainProcessPatch,
  applyPreloadPatch,
  readThreadStatusFromFile,
  sanitizeThreadStatus,
};
