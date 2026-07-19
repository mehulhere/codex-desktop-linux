#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  applyMainProcessPatch,
  applyPreloadPatch,
  formatPoolQuotaAge,
  readPoolStatusFromFile,
  readThreadStatusFromFile,
  readThreadStatusResultFromFile,
  sanitizePoolStatus,
} = require("./main-process.js");
const { applyStatusDialogPatch } = require("./webview.js");
const { applyTurnCompletedRefreshPatch } = require("./turn-completed.js");
const { applyMultiAuthThreadRoutingPatch } = require("./routing.js");
const {
  enabledLinuxFeatureInstallPlan,
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function applyTwice(fn, source) {
  const patched = fn(source);
  assert.equal(fn(patched), patched);
  return patched;
}

test("formats the combined quota age with a live seconds counter", () => {
  const now = 100_000;
  assert.equal(formatPoolQuotaAge(now, now), "Updated just now");
  assert.equal(formatPoolQuotaAge(now - 1_000, now), "Updated 1 second ago");
  assert.equal(formatPoolQuotaAge(now - 12_000, now), "Updated 12 seconds ago");
  assert.equal(formatPoolQuotaAge(now - 59_999, now), "Updated 59 seconds ago");
  assert.equal(formatPoolQuotaAge(now - 60_000, now), "Updated 1 minute ago");
  assert.equal(formatPoolQuotaAge(now - 120_000, now), "Updated 2 minutes ago");
});

test("reads only one validated redacted thread record", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-multi-auth-status-"));
  try {
    const statusPath = path.join(root, "status.json");
    fs.writeFileSync(
      statusPath,
      JSON.stringify({
        threadStatuses: {
          "thread-a": {
            accountNumber: 4,
            accountDisplay: "Account 4 (oc***@icloud.com)",
            maskedEmail: "oc***@icloud.com",
            primary: { usedPercent: 4, windowMinutes: 300, resetAtMs: Date.now() + 60_000 },
            secondary: { usedPercent: 1, windowMinutes: 10_080, resetAtMs: Date.now() + 120_000 },
            updatedAt: Date.now(),
            accessToken: "must-not-leak",
          },
          "thread-b": {
            accountNumber: 2,
            accountDisplay: "Account 2 (bo***@example.net)",
            maskedEmail: "bo***@example.net",
            primary: {},
            secondary: {},
            updatedAt: Date.now(),
          },
        },
      }),
    );

    const result = readThreadStatusFromFile(statusPath, "thread-a", Date.now());
    assert.deepEqual(Object.keys(result).sort(), [
      "accountDisplay",
      "accountNumber",
      "maskedEmail",
      "primary",
      "secondary",
      "updatedAt",
    ]);
    assert.equal(result.accountDisplay, "Account 4 (oc***@icloud.com)");
    assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
    assert.equal(JSON.stringify(result).includes("thread-b"), false);
    assert.equal(readThreadStatusFromFile(statusPath, "../thread-a", Date.now()), null);
    assert.equal(readThreadStatusFromFile(statusPath, "x".repeat(257), Date.now()), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects stale and malformed sidecar entries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-multi-auth-status-"));
  try {
    const statusPath = path.join(root, "status.json");
    fs.writeFileSync(
      statusPath,
      JSON.stringify({
        threadStatuses: {
          stale: {
            accountNumber: 1,
            accountDisplay: "Account 1 (al***@example.com)",
            maskedEmail: "al***@example.com",
            primary: {},
            secondary: {},
            updatedAt: 1,
          },
          raw: {
            accountNumber: 1,
            accountDisplay: "Account 1 (alice@example.com)",
            maskedEmail: "alice@example.com",
            primary: {},
            secondary: {},
            updatedAt: Date.now(),
          },
        },
      }),
    );
    assert.equal(readThreadStatusFromFile(statusPath, "stale", Date.now()), null);
    assert.equal(readThreadStatusFromFile(statusPath, "raw", Date.now()), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("keeps durable assignments and explains missing assignments", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-multi-auth-status-"));
  try {
    const statusPath = path.join(root, "status.json");
    const now = Date.now();
    fs.writeFileSync(
      statusPath,
      JSON.stringify({
        state: "running",
        threadStatuses: {
          durable: {
            accountNumber: 4,
            accountDisplay: "Account 4 (oc***@icloud.com)",
            maskedEmail: "oc***@icloud.com",
            primary: {},
            secondary: {},
            updatedAt: now - 24 * 60 * 60_000,
          },
        },
      }),
    );

    assert.equal(
      readThreadStatusResultFromFile(statusPath, "durable", now).accountDisplay,
      "Account 4 (oc***@icloud.com)",
    );
    assert.equal(
      readThreadStatusResultFromFile(statusPath, "missing", now).unassignedReason,
      "Not assigned — no current multi-auth assignment record",
    );

    fs.writeFileSync(
      statusPath,
      JSON.stringify({ state: "running", threadStatusPersistence: "error", threadStatuses: {} }),
    );
    assert.equal(
      readThreadStatusResultFromFile(statusPath, "missing", now).unassignedReason,
      "Not assigned — multi-auth assignment storage is unavailable",
    );

    fs.writeFileSync(statusPath, JSON.stringify({ state: "error", threadStatuses: {} }));
    assert.equal(
      readThreadStatusResultFromFile(statusPath, "missing", now).unassignedReason,
      "Not assigned — multi-auth router is unavailable",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reads only a fresh redacted combined quota summary", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-multi-auth-pool-"));
  try {
    const statusPath = path.join(root, "status.json");
    const now = Date.now();
    const poolQuota = {
      accountCount: 7,
      fiveHour: null,
      sevenDay: {
        windowMinutes: 10_080,
        reportedCount: 7,
        totalRemainingPercent: 176,
        averageRemainingPercent: 176 / 7,
      },
      updatedAt: now,
      secretEmail: "must-not-leak@example.com",
    };
    fs.writeFileSync(statusPath, JSON.stringify({ poolQuota }));

    assert.deepEqual(readPoolStatusFromFile(statusPath, now), {
      accountCount: 7,
      fiveHour: null,
      sevenDay: {
        windowMinutes: 10_080,
        reportedCount: 7,
        totalRemainingPercent: 176,
        averageRemainingPercent: 176 / 7,
      },
      updatedAt: now,
    });
    assert.equal(JSON.stringify(readPoolStatusFromFile(statusPath, now)).includes("@"), false);
    assert.equal(sanitizePoolStatus({ ...poolQuota, updatedAt: 1 }, now), null);
    assert.equal(
      sanitizePoolStatus({ ...poolQuota, accountCount: 0 }, now),
      null,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("patches main process and preload with a narrow IPC bridge", () => {
  const main =
    "let e=require(`electron`),f=require(`node:fs`),p=require(`node:path`);function start(){}exports.runMainAppStartup=start;";
  const preload =
    "let e=require(`electron`);var c=`fast`,D={getFastModeRolloutMetrics:async t=>e.ipcRenderer.invoke(c,t),getBuildFlavor:()=>`prod`};e.contextBridge.exposeInMainWorld(`electronBridge`,D);";

  const patchedMain = applyTwice(applyMainProcessPatch, main);
  const patchedPreload = applyTwice(applyPreloadPatch, preload);
  assert.match(patchedMain, /codex_linux:multi-auth-thread-status/);
  assert.match(patchedMain, /codex_linux:multi-auth-pool-status/);
  assert.match(patchedMain, /codex_linux:multi-auth-pool-refresh/);
  assert.match(patchedMain, /require\(`electron`\)/);
  assert.match(patchedMain, /execFile/);
  assert.match(patchedMain, /codex-multi-auth\.js/);
  assert.match(patchedMain, /runtime-rotation-app-bind-status\.json/);
  assert.match(patchedMain, /senderFrame/);
  assert.match(patchedPreload, /getMultiAuthThreadStatus/);
  assert.match(patchedPreload, /getMultiAuthPoolStatus/);
  assert.match(patchedPreload, /codex_linux:multi-auth-thread-status/);
  assert.match(patchedPreload, /codexLinuxMultiAuthPoolQuota/);
  assert.match(patchedPreload, /Combined quota/);
  assert.match(patchedPreload, /aria-label/);
  assert.match(patchedPreload, /data-codex-linux-sidebar-footer/);
  assert.match(patchedPreload, /MutationObserver/);
  assert.match(patchedPreload, /% quota/);
  assert.match(patchedPreload, /accounts/);
  assert.match(patchedPreload, /if \(value\?\.fiveHour\)/);
  assert.doesNotMatch(patchedPreload, /top:\s*["']4px["']/);
  assert.doesNotMatch(patchedPreload, /right:\s*["']88px["']/);
  assert.match(patchedPreload, /WebkitAppRegion:\s*["']no-drag["']/);
  assert.match(patchedPreload, /setInterval/);
  assert.match(patchedPreload, /focus/);
  assert.match(patchedPreload, /codex-linux-turn-completed/);
  assert.match(patchedPreload, /setTimeout/);
  assert.match(patchedPreload, /Updated \$\{seconds\} seconds ago/);
  assert.match(patchedPreload, /ageTimer/);
  assert.match(patchedPreload, /1_000/);
  assert.match(patchedPreload, /codex_linux:multi-auth-pool-refresh/);
  assert.match(patchedPreload, /Refreshing…/);
  assert.match(patchedPreload, /refreshButton/);
  assert.doesNotThrow(() => new Function(patchedPreload));
});

test("upgrades an installed main-process quota bridge with live refresh", () => {
  const legacyMain = [
    "const codexLinuxMultiAuthElectron=require(`electron`),codexLinuxMultiAuthFs=require(`node:fs`),codexLinuxMultiAuthPath=require(`node:path`);",
    "const codexLinuxMultiAuthPoolStatusChannel=`codex_linux:multi-auth-pool-status`;",
    "function codexLinuxMultiAuthStatusPath(){return `/tmp/status.json`}",
    "function codexLinuxReadMultiAuthPoolStatus(){return null}",
    "function codexLinuxMultiAuthTrustedStatusSender(){return true}",
    "codexLinuxMultiAuthElectron.ipcMain.removeHandler?.(codexLinuxMultiAuthPoolStatusChannel);codexLinuxMultiAuthElectron.ipcMain.handle(codexLinuxMultiAuthPoolStatusChannel,async e=>codexLinuxMultiAuthTrustedStatusSender(e)?codexLinuxReadMultiAuthPoolStatus():null);",
    "function codexLinuxReadMultiAuthThreadStatus(){return null}",
    "exports.runMainAppStartup=()=>{};",
  ].join("");

  const upgraded = applyTwice(applyMainProcessPatch, legacyMain);
  assert.match(upgraded, /codex_linux:multi-auth-pool-refresh/);
  assert.match(upgraded, /node:child_process/);
  assert.match(upgraded, /codexLinuxMultiAuthCheckCommand/);
  assert.match(upgraded, /execFile/);
  assert.doesNotThrow(() => new Function(upgraded));
});

test("refreshes the pool quota bridge when a turn completes", () => {
  assert.equal(typeof applyTurnCompletedRefreshPatch, "function");
  const source =
    "class T{onNotification(e,t){let n={method:e,params:t};switch(n.method){case`turn/completed`:{if(this.frameTextDeltaQueue.drainBefore(()=>{this.onNotification(`turn/completed`,n.params)}))break;let{threadId:e,turn:t}=n.params;break}}}}";

  const patched = applyTwice(applyTurnCompletedRefreshPatch, source);
  assert.notEqual(patched, source);
  assert.match(patched, /codex-linux-turn-completed/);
  assert.match(patched, /dispatchEvent/);
});

test("upgrades an already-patched preload with turn-completed refresh", () => {
  const legacyPreload = `let e=require(\`electron\`);var D={getMultiAuthThreadStatus:async t=>e.ipcRenderer.invoke(\`codex_linux:multi-auth-thread-status\`,t),getMultiAuthPoolStatus:async()=>e.ipcRenderer.invoke(\`codex_linux:multi-auth-pool-status\`),codexLinuxMultiAuthPoolQuota:(function poolQuotaUiBootstrap(ipcRenderer, channel) {
    const refresh = () => ipcRenderer.invoke(channel).then(render).catch(() => render(null));
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("beforeunload", () => clearInterval(timer), { once: true });
  })(e.ipcRenderer,"codex_linux:multi-auth-pool-status"),getBuildFlavor:()=>\`prod\`};`;

  const upgraded = applyTwice(applyPreloadPatch, legacyPreload);
  assert.notEqual(upgraded, legacyPreload);
  assert.match(upgraded, /codex-linux-turn-completed/);
  assert.match(upgraded, /refreshAfterTurn/);
  assert.doesNotThrow(() => new Function(upgraded));
});

test("upgrades the installed moments-ago quota panel to a live age counter", () => {
  const installedPreload = `let e=require(\`electron\`);var D={getMultiAuthThreadStatus:async t=>e.ipcRenderer.invoke(\`codex_linux:multi-auth-thread-status\`,t),getMultiAuthPoolStatus:async()=>e.ipcRenderer.invoke(\`codex_linux:multi-auth-pool-status\`),codexLinuxMultiAuthPoolQuota:(function poolQuotaUiBootstrap(ipcRenderer, channel, turnCompletedEvent) {
    const formatAge = (updatedAt) => {
      const minutes = Math.floor(Math.max(0, Date.now() - updatedAt) / 60_000);
      return minutes < 1 ? "Updated moments ago" : \`Updated \${minutes}m ago\`;
    };
    const render = (value) => {
      panel.textContent = value?.updatedAt ? formatAge(value.updatedAt) : "Status unavailable";
    };
    const refresh = () => ipcRenderer.invoke(channel).then(render).catch(() => render(null));
    refresh();
    const timer = setInterval(refresh, 60_000);
    let turnRefreshTimer = null;
    const refreshAfterTurn = () => {
      turnRefreshTimer = setTimeout(refresh, 1_200);
    };
    window.addEventListener(turnCompletedEvent, refreshAfterTurn);
    window.addEventListener("beforeunload", () => {
      clearInterval(timer);
      if (turnRefreshTimer !== null) clearTimeout(turnRefreshTimer);
    }, { once: true });
  })(e.ipcRenderer,"codex_linux:multi-auth-pool-status","codex-linux-turn-completed"),getBuildFlavor:()=>\`prod\`};`;

  const upgraded = applyTwice(applyPreloadPatch, installedPreload);
  assert.doesNotMatch(upgraded, /Updated moments ago/);
  assert.match(upgraded, /Updated \$\{seconds\} seconds ago/);
  assert.match(upgraded, /const ageTimer = setInterval/);
  assert.match(upgraded, /clearInterval\(ageTimer\)/);
  assert.match(upgraded, /codex_linux:multi-auth-pool-refresh/);
  assert.match(upgraded, /Refreshing…/);
  assert.doesNotMatch(upgraded, /role", "tooltip/);
  assert.doesNotThrow(() => new Function(upgraded));
});

test("adds the routed account and its quota rows to the current status dialog", () => {
  const source =
    "function zg(e){let t=(0,$.c)(22),{threadId:n,contextUsage:r,rateLimitRows:i,alertData:a,onClose:o}=e,s=Ht(),c=r.percent!=null,l=0,u=[],d=(e,t,n)=>{u.push({label:e,value:t})},p=`Session:`,[m,h]=(0,Z.useState)(!1),g=(0,Z.useRef)(null),_,v;if((0,Z.useEffect)(_,v),n&&d(p,n),c&&l!=null){d(`Context:`,l)}let x=i.filter(cIe);if(x.length>0){d(`Rate limit:`,x.length)}return u}";

  const patched = applyTwice(applyStatusDialogPatch, source);
  assert.match(patched, /getMultiAuthThreadStatus/);
  assert.match(patched, /Account:/);
  assert.match(patched, /Not assigned — status pending/);
  assert.match(patched, /accountDisplay/);
  assert.match(patched, /unassignedReason/);
  assert.match(patched, /codexLinuxMultiAuthRateLimitRows/);
  assert.match(patched, /windowDurationMins/);
  assert.match(patched, /resetAtMs\/1e3/);
  assert.match(patched, /codexLinuxMultiAuthRateLimitRows\.length/);
  assert.match(patched, /i=codexLinuxMultiAuthRateLimitRows/);
});

test("keeps legacy thread resume and fork on the native provider", () => {
  const source = [
    "F=e.sendRequest(`thread/resume`,{threadId:t,history:null,modelProvider:P.modelProvider,serviceTier:P.serviceTier,cwd:P.cwd})",
    "v=await e.sendRequest(`thread/fork`,{threadId:t,path:n??null,cwd:r,threadSource:m,model:u??void 0,config:_})",
  ].join(";");

  const patched = applyTwice(applyMultiAuthThreadRoutingPatch, source);
  assert.match(
    patched,
    /modelProvider:`openai`,serviceTier:P\.serviceTier/,
  );
  assert.match(
    patched,
    /thread\/fork`,\{threadId:t,modelProvider:`openai`,path:/,
  );
  assert.equal(patched.includes("codex-multi-auth-runtime-proxy"), false);

  const previouslyPatched = [
    "F=e.sendRequest(`thread/resume`,{threadId:t,history:null,modelProvider:P.modelProvider??`codex-multi-auth-runtime-proxy`,serviceTier:P.serviceTier,cwd:P.cwd})",
    "v=await e.sendRequest(`thread/fork`,{threadId:t,modelProvider:`codex-multi-auth-runtime-proxy`,path:n??null,cwd:r})",
  ].join(";");
  const migrated = applyMultiAuthThreadRoutingPatch(previouslyPatched);
  assert.match(migrated, /modelProvider:`openai`,serviceTier:P\.serviceTier/);
  assert.match(migrated, /thread\/fork`,\{threadId:t,modelProvider:`openai`,path:/);
});

test("matches both legacy composer and current app-initial status assets", () => {
  const { descriptors } = require("./patch.js");
  const statusDescriptor = descriptors.find((descriptor) => descriptor.id === "status-dialog");
  assert.equal(statusDescriptor.pattern.test("composer-B7sGHJVq.js"), true);
  assert.equal(statusDescriptor.pattern.test("app-initial~app-main~page-hSvsQcNf.js"), true);
});

test("exposes all three patch phases only when the feature is enabled", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-multi-auth-feature-"));
  const previous = process.env.CODEX_LINUX_FEATURES_CONFIG;
  process.env.CODEX_LINUX_FEATURES_CONFIG = path.join(temp, "features.json");
  try {
    fs.writeFileSync(process.env.CODEX_LINUX_FEATURES_CONFIG, JSON.stringify({ enabled: [] }));
    assert.deepEqual(
      loadLinuxFeaturePatchDescriptors({ featuresRoot: path.resolve(__dirname, "..") }),
      [],
    );
    fs.writeFileSync(
      process.env.CODEX_LINUX_FEATURES_CONFIG,
      JSON.stringify({ enabled: ["multi-auth-thread-status"] }),
    );
    const descriptors = loadLinuxFeaturePatchDescriptors({
      featuresRoot: path.resolve(__dirname, ".."),
    });
    assert.deepEqual(
      descriptors.map((descriptor) => descriptor.phase),
      [
        "main-bundle",
        "extracted-app:post-webview",
        "webview-asset",
        "webview-asset",
        "webview-asset",
      ],
    );
  } finally {
    if (previous == null) delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    else process.env.CODEX_LINUX_FEATURES_CONFIG = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("stages a prelaunch hook that restores a missing bound router", async () => {
  const featuresRoot = path.resolve(__dirname, "..");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-multi-auth-router-prelaunch-"));
  const configPath = path.join(temp, "features.json");
  const codexHome = path.join(temp, "codex-home");
  const appDir = path.join(temp, "app");
  const bindDir = path.join(codexHome, "multi-auth", "app-bind");
  const statusPath = path.join(bindDir, "status.json");
  const statePath = path.join(bindDir, "runtime-rotation-app-bind.json");
  const logPath = path.join(bindDir, "router.log");
  const routerPath = path.join(temp, "fake-router.cjs");
  const bundledNode = path.join(appDir, "resources", "node-runtime", "bin", "node");
  const port = await reserveLoopbackPort();
  fs.mkdirSync(path.dirname(bundledNode), { recursive: true });
  fs.mkdirSync(bindDir, { recursive: true });
  fs.symlinkSync(process.execPath, bundledNode);
  fs.writeFileSync(configPath, JSON.stringify({ enabled: ["multi-auth-thread-status"] }));
  fs.writeFileSync(
    routerPath,
    [
      'const fs=require("node:fs"),http=require("node:http");',
      'let args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,x)=>i%2?a:[...a,[v,x[i+1]]],[]));',
      'let server=http.createServer((req,res)=>res.end("ok"));',
      'server.listen(Number(args["--port"]),"127.0.0.1",()=>fs.writeFileSync(args["--status"],JSON.stringify({pid:process.pid,state:"running"})));',
      'process.on("SIGTERM",()=>server.close(()=>process.exit(0)));',
    ].join(""),
  );
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      version: 1,
      host: "127.0.0.1",
      port,
      nodePath: process.execPath,
      routerScriptPath: routerPath,
      statusPath,
      statePath,
      logPath,
    }),
  );

  const plan = enabledLinuxFeatureInstallPlan({ featuresRoot, featuresConfigPath: configPath });
  const hook = plan.runtimeHooks.find(
    (entry) => entry.id === "multi-auth-thread-status" && entry.key === "prelaunch",
  );
  assert.ok(hook);
  const result = spawnSync(hook.source, [appDir], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome },
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const routerStatus = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  assert.equal(routerStatus.state, "running");
  process.kill(routerStatus.pid, "SIGTERM");
});
