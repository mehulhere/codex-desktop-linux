"use strict";

const fs = require("node:fs");
const path = require("node:path");
const IPC_CHANNEL = "codex_linux:multi-auth-thread-status";
const POOL_IPC_CHANNEL = "codex_linux:multi-auth-pool-status";
const POOL_REFRESH_IPC_CHANNEL = "codex_linux:multi-auth-pool-refresh";
const STATUS_FILE = "runtime-rotation-app-bind-status.json";
const MAX_STATUS_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_POOL_STATUS_AGE_MS = 5 * 60 * 1000;
const SESSION_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
const TURN_COMPLETED_EVENT = "codex-linux-turn-completed";

function formatPoolQuotaAge(updatedAt, now = Date.now()) {
  const seconds = Math.floor(Math.max(0, now - updatedAt) / 1_000);
  if (seconds < 1) return "Updated just now";
  if (seconds === 1) return "Updated 1 second ago";
  if (seconds < 60) return `Updated ${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes === 1 ? "Updated 1 minute ago" : `Updated ${minutes} minutes ago`;
}

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

function poolQuotaUiBootstrap(
  ipcRenderer,
  channel,
  turnCompletedEvent,
  formatAge,
  refreshChannel,
) {
  const codexLinuxMultiAuthPoolQuota = true;
  function install() {
    if (document.getElementById("codex-linux-multi-auth-pool-quota")) return;
    const root = document.createElement("div");
    const button = document.createElement("button");
    const ring = document.createElement("span");
    const ringInner = document.createElement("span");
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    const meta = document.createElement("small");
    const panel = document.createElement("div");
    const detail = document.createElement("div");
    const refreshButton = document.createElement("button");
    root.id = "codex-linux-multi-auth-pool-quota";
    Object.assign(root.style, {
      position: "relative",
      flex: "1 1 auto",
      minWidth: "0",
      maxWidth: "220px",
      fontFamily: "ui-sans-serif,system-ui,sans-serif",
      WebkitAppRegion: "no-drag",
    });
    button.type = "button";
    button.setAttribute("aria-label", "Combined quota unavailable");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "codex-linux-multi-auth-pool-panel");
    Object.assign(button.style, {
      display: "flex",
      width: "100%",
      minWidth: "0",
      height: "40px",
      alignItems: "center",
      gap: "10px",
      border: "0",
      borderRadius: "10px",
      padding: "4px 8px",
      cursor: "pointer",
      background: "transparent",
      color: "inherit",
      textAlign: "left",
      WebkitAppRegion: "no-drag",
    });
    ring.setAttribute("aria-hidden", "true");
    Object.assign(ring.style, {
      display: "flex",
      width: "30px",
      height: "30px",
      flex: "0 0 auto",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "999px",
      padding: "2px",
      background: "#777",
    });
    Object.assign(ringInner.style, {
      display: "flex",
      width: "26px",
      height: "26px",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "999px",
      background: "Canvas",
      color: "CanvasText",
      fontSize: "10px",
      fontWeight: "650",
      lineHeight: "1",
    });
    ringInner.textContent = "—";
    ring.appendChild(ringInner);
    Object.assign(copy.style, {
      display: "flex",
      minWidth: "0",
      flexDirection: "column",
      gap: "1px",
    });
    Object.assign(label.style, {
      overflow: "hidden",
      color: "inherit",
      fontSize: "13px",
      fontWeight: "560",
      lineHeight: "16px",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    Object.assign(meta.style, {
      overflow: "hidden",
      color: "color-mix(in srgb, currentColor 58%, transparent)",
      fontSize: "11px",
      fontWeight: "400",
      lineHeight: "14px",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    label.textContent = "Quota unavailable";
    meta.textContent = "Waiting for status";
    copy.append(label, meta);
    button.append(ring, copy);
    panel.id = "codex-linux-multi-auth-pool-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Combined quota details");
    Object.assign(panel.style, {
      display: "none",
      position: "absolute",
      bottom: "44px",
      left: "0",
      zIndex: "2147483000",
      minWidth: "286px",
      whiteSpace: "normal",
      padding: "12px 14px",
      border: "1px solid color-mix(in srgb, CanvasText 14%, transparent)",
      borderRadius: "12px",
      background: "color-mix(in srgb, Canvas 97%, transparent)",
      boxShadow: "0 10px 28px rgba(0,0,0,.35)",
      color: "CanvasText",
      fontSize: "12px",
      lineHeight: "1.55",
      pointerEvents: "auto",
    });
    Object.assign(detail.style, { whiteSpace: "pre" });
    refreshButton.type = "button";
    refreshButton.textContent = "Refresh";
    Object.assign(refreshButton.style, {
      marginTop: "10px",
      border: "1px solid color-mix(in srgb, CanvasText 18%, transparent)",
      borderRadius: "7px",
      padding: "4px 9px",
      background: "color-mix(in srgb, CanvasText 8%, transparent)",
      color: "inherit",
      cursor: "pointer",
      font: "inherit",
      pointerEvents: "auto",
    });
    detail.textContent = "Combined quota\n\n7-day    Unavailable";
    panel.append(detail, refreshButton);
    root.append(button, panel);
    const show = () => {
      panel.style.display = "block";
      button.style.background = "rgba(127,127,127,.12)";
      button.setAttribute("aria-expanded", "true");
    };
    const hide = () => {
      panel.style.display = "none";
      button.style.background = "transparent";
      button.setAttribute("aria-expanded", "false");
    };
    root.addEventListener("pointerenter", show);
    root.addEventListener("pointerleave", hide);
    root.addEventListener("focusin", show);
    root.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!root.contains(document.activeElement)) hide();
      }, 0);
    });
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-expanded") === "true") hide();
      else show();
    });

    refreshButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (refreshButton.disabled) return;
      refreshButton.disabled = true;
      refreshButton.style.cursor = "wait";
      refreshButton.textContent = "Refreshing…";
      try {
        const result = await ipcRenderer.invoke(refreshChannel);
        if (result?.ok && result.status) render(result.status);
        refreshButton.textContent = result?.ok ? "Refreshed" : "Retry";
      } catch {
        refreshButton.textContent = "Retry";
      } finally {
        setTimeout(() => {
          refreshButton.disabled = false;
          refreshButton.style.cursor = "pointer";
          refreshButton.textContent = "Refresh";
        }, 1_500);
      }
    });

    const formatWindow = (label, value) => value
      ? `${label.padEnd(10)}${Math.round(value.totalRemainingPercent)}% total    ${Math.round(value.averageRemainingPercent)}% average`
      : `${label.padEnd(10)}Unavailable`;
    let latestValue = null;
    const render = (value) => {
      latestValue = value;
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
      ringInner.textContent = average == null ? "—" : String(average);
      ring.style.background = average == null
        ? color
        : `conic-gradient(${color} ${bounded * 3.6}deg,rgba(255,255,255,.16) 0)`;
      label.textContent = average == null ? "Quota unavailable" : `${average}% quota`;
      meta.textContent = value?.accountCount
        ? `${value.accountCount} ${value.accountCount === 1 ? "account" : "accounts"}`
        : "Waiting for status";
      button.setAttribute(
        "aria-label",
        average == null
          ? "Combined quota unavailable"
          : `${average}% quota across ${value.accountCount} accounts`,
      );
      const detailLines = [
        `Combined quota · ${value?.accountCount ?? 0} accounts`,
        "",
        formatWindow("7-day", value?.sevenDay),
      ];
      if (value?.fiveHour) detailLines.push(formatWindow("5-hour", value.fiveHour));
      detailLines.push("", value?.updatedAt ? formatAge(value.updatedAt) : "Status unavailable");
      detail.textContent = detailLines.join("\n");
    };
    const refresh = () => ipcRenderer.invoke(channel).then(render).catch(() => render(null));
    refresh();
    const refreshTimer = setInterval(refresh, 60_000);
    const ageTimer = setInterval(() => {
      if (latestValue?.updatedAt) render(latestValue);
    }, 1_000);
    let turnRefreshTimer = null;
    const refreshAfterTurn = () => {
      if (turnRefreshTimer !== null) clearTimeout(turnRefreshTimer);
      // The router has already observed the completed response's quota headers,
      // but its owner-only status sidecar is written on a one-second cadence.
      turnRefreshTimer = setTimeout(() => {
        turnRefreshTimer = null;
        refresh();
      }, 1_200);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener(turnCompletedEvent, refreshAfterTurn);
    window.addEventListener("beforeunload", () => {
      clearInterval(refreshTimer);
      clearInterval(ageTimer);
      if (turnRefreshTimer !== null) clearTimeout(turnRefreshTimer);
      window.removeEventListener(turnCompletedEvent, refreshAfterTurn);
    }, { once: true });

    const selector = "[data-codex-linux-sidebar-footer]";
    const mount = () => {
      const footer = document.querySelector(selector);
      if (!footer) return false;
      footer.prepend(root);
      return true;
    };
    if (!mount()) {
      const observer = new MutationObserver(() => {
        if (mount()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 30_000);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
  return codexLinuxMultiAuthPoolQuota;
}

function injectedPreloadUiSource(electronVar) {
  return `codexLinuxMultiAuthPoolQuota:(${poolQuotaUiBootstrap.toString()})(${electronVar}.ipcRenderer,${JSON.stringify(POOL_IPC_CHANNEL)},${JSON.stringify(TURN_COMPLETED_EVENT)},${formatPoolQuotaAge.toString()},${JSON.stringify(POOL_REFRESH_IPC_CHANNEL)}),`;
}

function injectedMainSource() {
  return [
    `const codexLinuxMultiAuthElectron=require(\`electron\`),codexLinuxMultiAuthFs=require(\`node:fs\`),codexLinuxMultiAuthPath=require(\`node:path\`),codexLinuxMultiAuthChildProcess=require(\`node:child_process\`);`,
    `const codexLinuxMultiAuthStatusChannel=\`${IPC_CHANNEL}\`;`,
    `const codexLinuxMultiAuthPoolStatusChannel=\`${POOL_IPC_CHANNEL}\`;`,
    `const codexLinuxMultiAuthPoolRefreshChannel=\`${POOL_REFRESH_IPC_CHANNEL}\`;`,
    `function codexLinuxMultiAuthStatusPath(){let e=process.env.CODEX_MULTI_AUTH_DIR?.trim()||codexLinuxMultiAuthPath.join(process.env.HOME||codexLinuxMultiAuthElectron.app.getPath(\`home\`),\`.codex\`,\`multi-auth\`);return codexLinuxMultiAuthPath.join(e,\`app-bind\`,\`${STATUS_FILE}\`)}`,
    `function codexLinuxMultiAuthStatusWindow(e){if(e==null||typeof e!==\`object\`||Array.isArray(e))return{};let t={};for(let n of[\`usedPercent\`,\`windowMinutes\`,\`resetAtMs\`])typeof e[n]===\`number\`&&Number.isFinite(e[n])&&(t[n]=e[n]);return t}`,
    `function codexLinuxMultiAuthThreadStatus(e,t=Date.now()){if(e==null||typeof e!==\`object\`||Array.isArray(e)||!Number.isInteger(e.accountNumber)||e.accountNumber<1||typeof e.accountDisplay!==\`string\`||e.accountDisplay.length>200||!e.accountDisplay.startsWith(\`Account \${e.accountNumber}\`))return null;if(e.maskedEmail!==null&&(typeof e.maskedEmail!==\`string\`||e.maskedEmail.length>160||!e.maskedEmail.includes(\`***@\`)||!e.accountDisplay.includes(e.maskedEmail)))return null;if(typeof e.updatedAt!==\`number\`||!Number.isFinite(e.updatedAt)||e.updatedAt<=0||t-e.updatedAt>${MAX_STATUS_AGE_MS}||e.updatedAt-t>6e4)return null;return{accountNumber:e.accountNumber,accountDisplay:e.accountDisplay,maskedEmail:e.maskedEmail,primary:codexLinuxMultiAuthStatusWindow(e.primary),secondary:codexLinuxMultiAuthStatusWindow(e.secondary),updatedAt:e.updatedAt}}`,
    `function codexLinuxReadMultiAuthThreadStatus(e){if(typeof e!==\`string\`||!${SESSION_PATTERN.toString()}.test(e))return null;try{let t=JSON.parse(codexLinuxMultiAuthFs.readFileSync(codexLinuxMultiAuthStatusPath(),\`utf8\`)),n=codexLinuxMultiAuthThreadStatus(t?.threadStatuses?.[e]);return n??{unassignedReason:t?.state===\`running\`&&t?.threadStatusPersistence===\`error\`?\`Not assigned — multi-auth assignment storage is unavailable\`:t?.state===\`running\`?\`Not assigned — no current multi-auth assignment record\`:\`Not assigned — multi-auth router is unavailable\`}}catch{return{unassignedReason:\`Not assigned — multi-auth status is unavailable\`}}}`,
    `function codexLinuxMultiAuthPoolWindow(e,t,n){if(e==null)return null;if(typeof e!==\`object\`||Array.isArray(e)||e.windowMinutes!==t||!Number.isInteger(e.reportedCount)||e.reportedCount<1||e.reportedCount>n||typeof e.totalRemainingPercent!==\`number\`||!Number.isFinite(e.totalRemainingPercent)||e.totalRemainingPercent<0||e.totalRemainingPercent>n*100||typeof e.averageRemainingPercent!==\`number\`||!Number.isFinite(e.averageRemainingPercent)||e.averageRemainingPercent<0||e.averageRemainingPercent>100)return null;let r={windowMinutes:e.windowMinutes,reportedCount:e.reportedCount,totalRemainingPercent:e.totalRemainingPercent,averageRemainingPercent:e.averageRemainingPercent};for(let t of[\`earliestResetAtMs\`,\`latestResetAtMs\`])typeof e[t]===\`number\`&&Number.isFinite(e[t])&&e[t]>0&&(r[t]=e[t]);return r}`,
    `function codexLinuxMultiAuthPoolStatus(e,t=Date.now()){if(e==null||typeof e!==\`object\`||Array.isArray(e)||!Number.isInteger(e.accountCount)||e.accountCount<1||e.accountCount>256||typeof e.updatedAt!==\`number\`||!Number.isFinite(e.updatedAt)||e.updatedAt<=0||t-e.updatedAt>${MAX_POOL_STATUS_AGE_MS}||e.updatedAt-t>6e4)return null;return{accountCount:e.accountCount,fiveHour:codexLinuxMultiAuthPoolWindow(e.fiveHour,300,e.accountCount),sevenDay:codexLinuxMultiAuthPoolWindow(e.sevenDay,10080,e.accountCount),updatedAt:e.updatedAt}}`,
    `function codexLinuxReadMultiAuthPoolStatus(){try{return codexLinuxMultiAuthPoolStatus(JSON.parse(codexLinuxMultiAuthFs.readFileSync(codexLinuxMultiAuthStatusPath(),\`utf8\`))?.poolQuota)}catch{return null}}`,
    `function codexLinuxMultiAuthCheckCommand(){try{let e=JSON.parse(codexLinuxMultiAuthFs.readFileSync(codexLinuxMultiAuthStatusPath(),\`utf8\`)),t=e?.pid;if(!Number.isInteger(t)||t<1)return null;let n=codexLinuxMultiAuthFs.readFileSync(\`/proc/\${t}/cmdline\`,\`utf8\`).split(\`\\0\`).filter(Boolean),r=n.find(e=>e.endsWith(\`/scripts/codex-app-router.js\`));if(!r)return null;let i=codexLinuxMultiAuthPath.join(codexLinuxMultiAuthPath.dirname(r),\`codex-multi-auth.js\`),a=codexLinuxMultiAuthPath.join(process.resourcesPath,\`node-runtime\`,\`bin\`,\`node\`);return codexLinuxMultiAuthFs.existsSync(i)&&codexLinuxMultiAuthFs.existsSync(a)?{node:a,cli:i}:null}catch{return null}}`,
    `let codexLinuxMultiAuthPoolRefreshPromise=null;function codexLinuxRefreshMultiAuthPool(){if(codexLinuxMultiAuthPoolRefreshPromise)return codexLinuxMultiAuthPoolRefreshPromise;let e=codexLinuxMultiAuthCheckCommand();if(!e)return Promise.resolve({ok:!1,status:codexLinuxReadMultiAuthPoolStatus()});return codexLinuxMultiAuthPoolRefreshPromise=new Promise(t=>{codexLinuxMultiAuthChildProcess.execFile(e.node,[e.cli,\`check\`],{timeout:12e4,maxBuffer:524288,env:{...process.env,NO_COLOR:\`1\`,TERM:\`dumb\`}},e=>{if(e)return t({ok:!1,status:codexLinuxReadMultiAuthPoolStatus()});setTimeout(()=>t({ok:!0,status:codexLinuxReadMultiAuthPoolStatus()}),1500)})}).finally(()=>{codexLinuxMultiAuthPoolRefreshPromise=null}),codexLinuxMultiAuthPoolRefreshPromise}`,
    `function codexLinuxMultiAuthTrustedStatusSender(e){let t=e?.senderFrame?.url??e?.sender?.getURL?.()??\`\`;return typeof t===\`string\`&&(t.startsWith(\`file://\`)||/^https?:\\/\\/(?:127\\.0\\.0\\.1|localhost)(?::\\d+)?(?:\\/|$)/.test(t))}`,
    `codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthStatusChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthStatusChannel,async(e,t)=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxReadMultiAuthThreadStatus(t):null);`,
    `codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthPoolStatusChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthPoolStatusChannel,async e=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxReadMultiAuthPoolStatus():null);`,
    `codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthPoolRefreshChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthPoolRefreshChannel,async e=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxRefreshMultiAuthPool():null);`,
  ].join("");
}

function upgradePreloadTurnRefresh(source) {
  if (source.includes(TURN_COMPLETED_EVENT)) return source;
  if (
    !source.includes("getMultiAuthPoolStatus") ||
    !source.includes("function poolQuotaUiBootstrap(ipcRenderer, channel)")
  ) {
    return source;
  }
  const oldLifecycle = `    const refresh = () => ipcRenderer.invoke(channel).then(render).catch(() => render(null));
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("beforeunload", () => clearInterval(timer), { once: true });`;
  const newLifecycle = `    const refresh = () => ipcRenderer.invoke(channel).then(render).catch(() => render(null));
    refresh();
    const timer = setInterval(refresh, 60_000);
    let turnRefreshTimer = null;
    const refreshAfterTurn = () => {
      if (turnRefreshTimer !== null) clearTimeout(turnRefreshTimer);
      turnRefreshTimer = setTimeout(() => {
        turnRefreshTimer = null;
        refresh();
      }, 1_200);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener(turnCompletedEvent, refreshAfterTurn);
    window.addEventListener("beforeunload", () => {
      clearInterval(timer);
      if (turnRefreshTimer !== null) clearTimeout(turnRefreshTimer);
      window.removeEventListener(turnCompletedEvent, refreshAfterTurn);
    }, { once: true });`;
  if (!source.includes(oldLifecycle)) return source;
  const callPattern = new RegExp(
    `\\}\\)\\(([A-Za-z_$][\\w$]*)\\.ipcRenderer,${JSON.stringify(POOL_IPC_CHANNEL)}\\),`,
  );
  if (!callPattern.test(source)) return source;
  return source
    .replace(
      "function poolQuotaUiBootstrap(ipcRenderer, channel)",
      "function poolQuotaUiBootstrap(ipcRenderer, channel, turnCompletedEvent)",
    )
    .replace(oldLifecycle, newLifecycle)
    .replace(
      callPattern,
      `})($1.ipcRenderer,${JSON.stringify(POOL_IPC_CHANNEL)},${JSON.stringify(TURN_COMPLETED_EVENT)}),`,
    );
}

function upgradePreloadQuotaAge(source) {
  if (source.includes("const ageTimer = setInterval")) return source;
  const oldSignature = "function poolQuotaUiBootstrap(ipcRenderer, channel, turnCompletedEvent)";
  const oldFormatter = `    const formatAge = (updatedAt) => {
      const minutes = Math.floor(Math.max(0, Date.now() - updatedAt) / 60_000);
      return minutes < 1 ? "Updated moments ago" : \`Updated \${minutes}m ago\`;
    };
`;
  const oldRenderStart = "    const render = (value) => {\n";
  const oldTimer = "    const timer = setInterval(refresh, 60_000);";
  const oldCleanup = "      clearInterval(timer);";
  const callPattern = new RegExp(
    `\\}\\)\\(([A-Za-z_$][\\w$]*)\\.ipcRenderer,${JSON.stringify(POOL_IPC_CHANNEL)},${JSON.stringify(TURN_COMPLETED_EVENT)}\\),`,
  );
  if (
    !source.includes(oldSignature) ||
    !source.includes(oldFormatter) ||
    !source.includes(oldRenderStart) ||
    !source.includes(oldTimer) ||
    !source.includes(oldCleanup) ||
    !callPattern.test(source)
  ) {
    return source;
  }
  return source
    .replace(
      oldSignature,
      "function poolQuotaUiBootstrap(ipcRenderer, channel, turnCompletedEvent, formatAge)",
    )
    .replace(oldFormatter, "    let latestValue = null;\n")
    .replace(oldRenderStart, `${oldRenderStart}      latestValue = value;\n`)
    .replace(
      oldTimer,
      `    const refreshTimer = setInterval(refresh, 60_000);
    const ageTimer = setInterval(() => {
      if (latestValue?.updatedAt) render(latestValue);
    }, 1_000);`,
    )
    .replace(oldCleanup, "      clearInterval(refreshTimer);\n      clearInterval(ageTimer);")
    .replace(
      callPattern,
      (_match, electronVar) => `})(${electronVar}.ipcRenderer,${JSON.stringify(POOL_IPC_CHANNEL)},${JSON.stringify(TURN_COMPLETED_EVENT)},${formatPoolQuotaAge.toString()}),`,
    );
}

function upgradePreloadQuotaRefresh(source) {
  if (source.includes('refreshButton.textContent = "Refreshing…"')) return source;
  const oldSignature =
    "function poolQuotaUiBootstrap(ipcRenderer, channel, turnCompletedEvent, formatAge)";
  const newSignature =
    "function poolQuotaUiBootstrap(ipcRenderer, channel, turnCompletedEvent, formatAge, refreshChannel)";
  const renderMarker = "    const render = (value) => {\n";
  const oldCallSuffix = `,${formatPoolQuotaAge.toString()}),`;
  if (
    !source.includes(oldSignature) ||
    !source.includes(renderMarker) ||
    !source.includes(oldCallSuffix)
  ) {
    return source;
  }
  const refreshUi = `    const detail = document.createElement("div");
    const refreshButton = document.createElement("button");
    detail.textContent = panel.textContent;
    detail.style.whiteSpace = "pre";
    refreshButton.type = "button";
    refreshButton.textContent = "Refresh";
    Object.assign(refreshButton.style, {
      marginTop: "10px",
      border: "1px solid color-mix(in srgb, CanvasText 18%, transparent)",
      borderRadius: "7px",
      padding: "4px 9px",
      background: "color-mix(in srgb, CanvasText 8%, transparent)",
      color: "inherit",
      cursor: "pointer",
      font: "inherit",
      pointerEvents: "auto",
    });
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Combined quota details");
    panel.style.pointerEvents = "auto";
    panel.style.whiteSpace = "normal";
    panel.replaceChildren(detail, refreshButton);
    refreshButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (refreshButton.disabled) return;
      refreshButton.disabled = true;
      refreshButton.style.cursor = "wait";
      refreshButton.textContent = "Refreshing…";
      try {
        const result = await ipcRenderer.invoke(refreshChannel);
        if (result?.ok && result.status) render(result.status);
        refreshButton.textContent = result?.ok ? "Refreshed" : "Retry";
      } catch {
        refreshButton.textContent = "Retry";
      } finally {
        setTimeout(() => {
          refreshButton.disabled = false;
          refreshButton.style.cursor = "pointer";
          refreshButton.textContent = "Refresh";
        }, 1_500);
      }
    });
`;
  let upgraded = source
    .replace(oldSignature, newSignature)
    .replace('panel.setAttribute("role", "tooltip");', 'panel.setAttribute("role", "dialog");')
    .replace(renderMarker, `${refreshUi}${renderMarker}`)
    .replace(
      oldCallSuffix,
      `,${formatPoolQuotaAge.toString()},${JSON.stringify(POOL_REFRESH_IPC_CHANNEL)}),`,
    );
  const renderIndex = upgraded.indexOf(renderMarker);
  if (renderIndex < 0) return source;
  upgraded =
    upgraded.slice(0, renderIndex) +
    upgraded.slice(renderIndex).replaceAll("panel.textContent =", "detail.textContent =");
  return upgraded;
}

function upgradeMainPoolRefresh(source) {
  if (source.includes(POOL_REFRESH_IPC_CHANNEL)) return source;
  const oldRequire =
    "const codexLinuxMultiAuthElectron=require(`electron`),codexLinuxMultiAuthFs=require(`node:fs`),codexLinuxMultiAuthPath=require(`node:path`);";
  const newRequire =
    "const codexLinuxMultiAuthElectron=require(`electron`),codexLinuxMultiAuthFs=require(`node:fs`),codexLinuxMultiAuthPath=require(`node:path`),codexLinuxMultiAuthChildProcess=require(`node:child_process`);";
  const poolChannel = `const codexLinuxMultiAuthPoolStatusChannel=\`${POOL_IPC_CHANNEL}\`;`;
  const trustedSenderMarker = "function codexLinuxMultiAuthTrustedStatusSender";
  const poolHandler =
    "codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthPoolStatusChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthPoolStatusChannel,async e=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxReadMultiAuthPoolStatus():null);";
  if (
    !source.includes(oldRequire) ||
    !source.includes(poolChannel) ||
    !source.includes(trustedSenderMarker) ||
    !source.includes(poolHandler)
  ) {
    return source;
  }
  const refreshRuntime = [
    `function codexLinuxMultiAuthCheckCommand(){try{let e=JSON.parse(codexLinuxMultiAuthFs.readFileSync(codexLinuxMultiAuthStatusPath(),\`utf8\`)),t=e?.pid;if(!Number.isInteger(t)||t<1)return null;let n=codexLinuxMultiAuthFs.readFileSync(\`/proc/\${t}/cmdline\`,\`utf8\`).split(\`\\0\`).filter(Boolean),r=n.find(e=>e.endsWith(\`/scripts/codex-app-router.js\`));if(!r)return null;let i=codexLinuxMultiAuthPath.join(codexLinuxMultiAuthPath.dirname(r),\`codex-multi-auth.js\`),a=codexLinuxMultiAuthPath.join(process.resourcesPath,\`node-runtime\`,\`bin\`,\`node\`);return codexLinuxMultiAuthFs.existsSync(i)&&codexLinuxMultiAuthFs.existsSync(a)?{node:a,cli:i}:null}catch{return null}}`,
    `let codexLinuxMultiAuthPoolRefreshPromise=null;function codexLinuxRefreshMultiAuthPool(){if(codexLinuxMultiAuthPoolRefreshPromise)return codexLinuxMultiAuthPoolRefreshPromise;let e=codexLinuxMultiAuthCheckCommand();if(!e)return Promise.resolve({ok:!1,status:codexLinuxReadMultiAuthPoolStatus()});return codexLinuxMultiAuthPoolRefreshPromise=new Promise(t=>{codexLinuxMultiAuthChildProcess.execFile(e.node,[e.cli,\`check\`],{timeout:12e4,maxBuffer:524288,env:{...process.env,NO_COLOR:\`1\`,TERM:\`dumb\`}},e=>{if(e)return t({ok:!1,status:codexLinuxReadMultiAuthPoolStatus()});setTimeout(()=>t({ok:!0,status:codexLinuxReadMultiAuthPoolStatus()}),1500)})}).finally(()=>{codexLinuxMultiAuthPoolRefreshPromise=null}),codexLinuxMultiAuthPoolRefreshPromise}`,
  ].join("");
  const refreshHandler =
    "codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthPoolRefreshChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthPoolRefreshChannel,async e=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxRefreshMultiAuthPool():null);";
  return source
    .replace(oldRequire, newRequire)
    .replace(
      poolChannel,
      `${poolChannel}const codexLinuxMultiAuthPoolRefreshChannel=\`${POOL_REFRESH_IPC_CHANNEL}\`;`,
    )
    .replace(trustedSenderMarker, `${refreshRuntime}${trustedSenderMarker}`)
    .replace(poolHandler, `${poolHandler}${refreshHandler}`);
}

function applyMainProcessPatch(source) {
  if (source.includes("codexLinuxReadMultiAuthThreadStatus")) {
    return upgradeMainPoolRefresh(source);
  }
  const marker = "exports.runMainAppStartup=";
  if (!source.includes(marker)) {
    console.warn("WARN: Could not find main-process startup export for multi-auth thread status");
    return source;
  }
  return source.replace(marker, `${injectedMainSource()}${marker}`);
}

function applyPreloadPatch(source) {
  if (source.includes("getMultiAuthThreadStatus")) {
    return upgradePreloadQuotaRefresh(
      upgradePreloadQuotaAge(upgradePreloadTurnRefresh(source)),
    );
  }
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
  formatPoolQuotaAge,
  readThreadStatusFromFile,
  readThreadStatusResultFromFile,
  readPoolStatusFromFile,
  sanitizePoolStatus,
  sanitizeThreadStatus,
};
