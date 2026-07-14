"use strict";

const fs = require("node:fs");
const path = require("node:path");
const IPC_CHANNEL = "codex_linux:multi-auth-thread-status";
const POOL_IPC_CHANNEL = "codex_linux:multi-auth-pool-status";
const STATUS_FILE = "runtime-rotation-app-bind-status.json";
const MAX_STATUS_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_POOL_STATUS_AGE_MS = 5 * 60 * 1000;
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

function sanitizePoolWindow(value, expectedMinutes, accountCount) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const { windowMinutes, reportedCount, totalRemainingPercent, averageRemainingPercent } = value;
  if (windowMinutes !== expectedMinutes) return null;
  if (!Number.isInteger(reportedCount) || reportedCount < 1 || reportedCount > accountCount) {
    return null;
  }
  if (
    typeof totalRemainingPercent !== "number" ||
    !Number.isFinite(totalRemainingPercent) ||
    totalRemainingPercent < 0 ||
    totalRemainingPercent > accountCount * 100 ||
    typeof averageRemainingPercent !== "number" ||
    !Number.isFinite(averageRemainingPercent) ||
    averageRemainingPercent < 0 ||
    averageRemainingPercent > 100
  ) return null;
  const result = {
    windowMinutes,
    reportedCount,
    totalRemainingPercent,
    averageRemainingPercent,
  };
  for (const key of ["earliestResetAtMs", "latestResetAtMs"]) {
    if (typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] > 0) {
      result[key] = value[key];
    }
  }
  return result;
}

function sanitizePoolStatus(value, now = Date.now()) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const { accountCount, updatedAt } = value;
  if (!Number.isInteger(accountCount) || accountCount < 1 || accountCount > 256) return null;
  if (
    typeof updatedAt !== "number" ||
    !Number.isFinite(updatedAt) ||
    updatedAt <= 0 ||
    now - updatedAt > MAX_POOL_STATUS_AGE_MS ||
    updatedAt - now > 60_000
  ) return null;
  return {
    accountCount,
    fiveHour: sanitizePoolWindow(value.fiveHour, 300, accountCount),
    sevenDay: sanitizePoolWindow(value.sevenDay, 10_080, accountCount),
    updatedAt,
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

function readThreadStatusResultFromFile(statusPath, sessionId, now = Date.now()) {
  if (!SESSION_PATTERN.test(sessionId ?? "")) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    const status = sanitizeThreadStatus(parsed?.threadStatuses?.[sessionId], now);
    if (status) return status;
    return {
      unassignedReason:
        parsed?.state === "running" && parsed?.threadStatusPersistence === "error"
          ? "Not assigned — multi-auth assignment storage is unavailable"
          : parsed?.state === "running"
            ? "Not assigned — no current multi-auth assignment record"
          : "Not assigned — multi-auth router is unavailable",
    };
  } catch {
    return { unassignedReason: "Not assigned — multi-auth status is unavailable" };
  }
}

function readPoolStatusFromFile(statusPath, now = Date.now()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    return sanitizePoolStatus(parsed?.poolQuota, now);
  } catch {
    return null;
  }
}

function poolQuotaUiBootstrap(ipcRenderer, channel) {
  const codexLinuxMultiAuthPoolQuota = true;
  function install() {
    if (document.getElementById("codex-linux-multi-auth-pool-quota")) return;
    const root = document.createElement("div");
    const button = document.createElement("button");
    const inner = document.createElement("span");
    const panel = document.createElement("div");
    root.id = "codex-linux-multi-auth-pool-quota";
    Object.assign(root.style, {
      position: "fixed",
      top: "52px",
      right: "88px",
      zIndex: "2147483000",
      fontFamily: "ui-sans-serif,system-ui,sans-serif",
    });
    button.type = "button";
    button.setAttribute("aria-label", "Combined quota unavailable");
    Object.assign(button.style, {
      width: "28px",
      height: "28px",
      border: "0",
      borderRadius: "999px",
      padding: "2px",
      cursor: "default",
      background: "#555",
      color: "#f5f5f5",
    });
    Object.assign(inner.style, {
      display: "flex",
      width: "24px",
      height: "24px",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "999px",
      background: "#202020",
      fontSize: "10px",
      fontWeight: "650",
      lineHeight: "1",
    });
    inner.textContent = "—";
    button.appendChild(inner);
    panel.setAttribute("role", "tooltip");
    Object.assign(panel.style, {
      display: "none",
      position: "absolute",
      top: "34px",
      right: "0",
      minWidth: "270px",
      whiteSpace: "pre",
      padding: "12px 14px",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: "10px",
      background: "rgba(32,32,32,.98)",
      boxShadow: "0 10px 28px rgba(0,0,0,.35)",
      color: "#f3f3f3",
      fontSize: "12px",
      lineHeight: "1.55",
      pointerEvents: "none",
    });
    panel.textContent = "Combined quota\n\n7-day    Unavailable\n5-hour   Unavailable";
    root.append(button, panel);
    const show = () => { panel.style.display = "block"; };
    const hide = () => { panel.style.display = "none"; };
    root.addEventListener("pointerenter", show);
    root.addEventListener("pointerleave", hide);
    root.addEventListener("focusin", show);
    root.addEventListener("focusout", hide);
    document.body.appendChild(root);

    const formatWindow = (label, value) => value
      ? `${label.padEnd(10)}${Math.round(value.totalRemainingPercent)}% total    ${Math.round(value.averageRemainingPercent)}% average`
      : `${label.padEnd(10)}Unavailable`;
    const formatAge = (updatedAt) => {
      const minutes = Math.floor(Math.max(0, Date.now() - updatedAt) / 60_000);
      return minutes < 1 ? "Updated moments ago" : `Updated ${minutes}m ago`;
    };
    const render = (value) => {
      const sevenDay = value?.sevenDay ?? null;
      const average = typeof sevenDay?.averageRemainingPercent === "number"
        ? Math.round(sevenDay.averageRemainingPercent)
        : null;
      const color = average == null
        ? "#777"
        : average <= 10
          ? "#ef4444"
          : average <= 25
            ? "#f59e0b"
            : "#22c55e";
      const bounded = average == null ? 0 : Math.max(0, Math.min(100, average));
      inner.textContent = average == null ? "—" : String(average);
      button.style.background = average == null
        ? color
        : `conic-gradient(${color} ${bounded * 3.6}deg,rgba(255,255,255,.16) 0)`;
      button.setAttribute(
        "aria-label",
        average == null
          ? "Combined quota unavailable"
          : `Combined 7-day quota: ${average}% remaining across ${value.accountCount} accounts`,
      );
      panel.textContent = [
        `Combined quota · ${value?.accountCount ?? 0} accounts`,
        "",
        formatWindow("7-day", value?.sevenDay),
        formatWindow("5-hour", value?.fiveHour),
        "",
        value?.updatedAt ? formatAge(value.updatedAt) : "Status unavailable",
      ].join("\n");
    };
    const refresh = () => ipcRenderer.invoke(channel).then(render).catch(() => render(null));
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("beforeunload", () => clearInterval(timer), { once: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
  return codexLinuxMultiAuthPoolQuota;
}

function injectedPreloadUiSource(electronVar) {
  return `codexLinuxMultiAuthPoolQuota:(${poolQuotaUiBootstrap.toString()})(${electronVar}.ipcRenderer,${JSON.stringify(POOL_IPC_CHANNEL)}),`;
}

function injectedMainSource() {
  return [
    `const codexLinuxMultiAuthElectron=require(\`electron\`),codexLinuxMultiAuthFs=require(\`node:fs\`),codexLinuxMultiAuthPath=require(\`node:path\`);`,
    `const codexLinuxMultiAuthStatusChannel=\`${IPC_CHANNEL}\`;`,
    `const codexLinuxMultiAuthPoolStatusChannel=\`${POOL_IPC_CHANNEL}\`;`,
    `function codexLinuxMultiAuthStatusPath(){let e=process.env.CODEX_MULTI_AUTH_DIR?.trim()||codexLinuxMultiAuthPath.join(process.env.HOME||codexLinuxMultiAuthElectron.app.getPath(\`home\`),\`.codex\`,\`multi-auth\`);return codexLinuxMultiAuthPath.join(e,\`app-bind\`,\`${STATUS_FILE}\`)}`,
    `function codexLinuxMultiAuthStatusWindow(e){if(e==null||typeof e!==\`object\`||Array.isArray(e))return{};let t={};for(let n of[\`usedPercent\`,\`windowMinutes\`,\`resetAtMs\`])typeof e[n]===\`number\`&&Number.isFinite(e[n])&&(t[n]=e[n]);return t}`,
    `function codexLinuxMultiAuthThreadStatus(e,t=Date.now()){if(e==null||typeof e!==\`object\`||Array.isArray(e)||!Number.isInteger(e.accountNumber)||e.accountNumber<1||typeof e.accountDisplay!==\`string\`||e.accountDisplay.length>200||!e.accountDisplay.startsWith(\`Account \${e.accountNumber}\`))return null;if(e.maskedEmail!==null&&(typeof e.maskedEmail!==\`string\`||e.maskedEmail.length>160||!e.maskedEmail.includes(\`***@\`)||!e.accountDisplay.includes(e.maskedEmail)))return null;if(typeof e.updatedAt!==\`number\`||!Number.isFinite(e.updatedAt)||e.updatedAt<=0||t-e.updatedAt>${MAX_STATUS_AGE_MS}||e.updatedAt-t>6e4)return null;return{accountNumber:e.accountNumber,accountDisplay:e.accountDisplay,maskedEmail:e.maskedEmail,primary:codexLinuxMultiAuthStatusWindow(e.primary),secondary:codexLinuxMultiAuthStatusWindow(e.secondary),updatedAt:e.updatedAt}}`,
    `function codexLinuxReadMultiAuthThreadStatus(e){if(typeof e!==\`string\`||!${SESSION_PATTERN.toString()}.test(e))return null;try{let t=JSON.parse(codexLinuxMultiAuthFs.readFileSync(codexLinuxMultiAuthStatusPath(),\`utf8\`)),n=codexLinuxMultiAuthThreadStatus(t?.threadStatuses?.[e]);return n??{unassignedReason:t?.state===\`running\`&&t?.threadStatusPersistence===\`error\`?\`Not assigned — multi-auth assignment storage is unavailable\`:t?.state===\`running\`?\`Not assigned — no current multi-auth assignment record\`:\`Not assigned — multi-auth router is unavailable\`}}catch{return{unassignedReason:\`Not assigned — multi-auth status is unavailable\`}}}`,
    `function codexLinuxMultiAuthPoolWindow(e,t,n){if(e==null)return null;if(typeof e!==\`object\`||Array.isArray(e)||e.windowMinutes!==t||!Number.isInteger(e.reportedCount)||e.reportedCount<1||e.reportedCount>n||typeof e.totalRemainingPercent!==\`number\`||!Number.isFinite(e.totalRemainingPercent)||e.totalRemainingPercent<0||e.totalRemainingPercent>n*100||typeof e.averageRemainingPercent!==\`number\`||!Number.isFinite(e.averageRemainingPercent)||e.averageRemainingPercent<0||e.averageRemainingPercent>100)return null;let r={windowMinutes:e.windowMinutes,reportedCount:e.reportedCount,totalRemainingPercent:e.totalRemainingPercent,averageRemainingPercent:e.averageRemainingPercent};for(let t of[\`earliestResetAtMs\`,\`latestResetAtMs\`])typeof e[t]===\`number\`&&Number.isFinite(e[t])&&e[t]>0&&(r[t]=e[t]);return r}`,
    `function codexLinuxMultiAuthPoolStatus(e,t=Date.now()){if(e==null||typeof e!==\`object\`||Array.isArray(e)||!Number.isInteger(e.accountCount)||e.accountCount<1||e.accountCount>256||typeof e.updatedAt!==\`number\`||!Number.isFinite(e.updatedAt)||e.updatedAt<=0||t-e.updatedAt>${MAX_POOL_STATUS_AGE_MS}||e.updatedAt-t>6e4)return null;return{accountCount:e.accountCount,fiveHour:codexLinuxMultiAuthPoolWindow(e.fiveHour,300,e.accountCount),sevenDay:codexLinuxMultiAuthPoolWindow(e.sevenDay,10080,e.accountCount),updatedAt:e.updatedAt}}`,
    `function codexLinuxReadMultiAuthPoolStatus(){try{return codexLinuxMultiAuthPoolStatus(JSON.parse(codexLinuxMultiAuthFs.readFileSync(codexLinuxMultiAuthStatusPath(),\`utf8\`))?.poolQuota)}catch{return null}}`,
    `function codexLinuxMultiAuthTrustedStatusSender(e){let t=e?.senderFrame?.url??e?.sender?.getURL?.()??\`\`;return typeof t===\`string\`&&(t.startsWith(\`file://\`)||/^https?:\\/\\/(?:127\\.0\\.0\\.1|localhost)(?::\\d+)?(?:\\/|$)/.test(t))}`,
    `codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthStatusChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthStatusChannel,async(e,t)=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxReadMultiAuthThreadStatus(t):null);`,
    `codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthPoolStatusChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthPoolStatusChannel,async e=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxReadMultiAuthPoolStatus():null);`,
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
    `${original}getMultiAuthThreadStatus:async ${argumentVar}=>${electronVar}.ipcRenderer.invoke(\`${IPC_CHANNEL}\`,${argumentVar}),getMultiAuthPoolStatus:async()=>${electronVar}.ipcRenderer.invoke(\`${POOL_IPC_CHANNEL}\`),${injectedPreloadUiSource(electronVar)}`,
  );
}

module.exports = {
  applyMainProcessPatch,
  applyPreloadPatch,
  readThreadStatusFromFile,
  readThreadStatusResultFromFile,
  readPoolStatusFromFile,
  sanitizePoolStatus,
  sanitizeThreadStatus,
};
