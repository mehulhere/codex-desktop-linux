#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  applyMainProcessPatch,
  applyPreloadPatch,
  readPoolStatusFromFile,
  readThreadStatusFromFile,
  readThreadStatusResultFromFile,
  sanitizePoolStatus,
} = require("./main-process.js");
const { applyStatusDialogPatch } = require("./webview.js");
const { applyMultiAuthThreadRoutingPatch } = require("./routing.js");
const {
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");

function applyTwice(fn, source) {
  const patched = fn(source);
  assert.equal(fn(patched), patched);
  return patched;
}

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
  assert.match(patchedMain, /require\(`electron`\)/);
  assert.match(patchedMain, /runtime-rotation-app-bind-status\.json/);
  assert.match(patchedMain, /senderFrame/);
  assert.match(patchedPreload, /getMultiAuthThreadStatus/);
  assert.match(patchedPreload, /getMultiAuthPoolStatus/);
  assert.match(patchedPreload, /codex_linux:multi-auth-thread-status/);
  assert.match(patchedPreload, /codexLinuxMultiAuthPoolQuota/);
  assert.match(patchedPreload, /Combined quota/);
  assert.match(patchedPreload, /aria-label/);
  assert.match(patchedPreload, /setInterval/);
  assert.match(patchedPreload, /focus/);
  assert.doesNotThrow(() => new Function(patchedPreload));
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

test("routes legacy thread resume and fork through multi-auth", () => {
  const source = [
    "F=e.sendRequest(`thread/resume`,{threadId:t,history:null,modelProvider:P.modelProvider,serviceTier:P.serviceTier,cwd:P.cwd})",
    "v=await e.sendRequest(`thread/fork`,{threadId:t,path:n??null,cwd:r,threadSource:m,model:u??void 0,config:_})",
  ].join(";");

  const patched = applyTwice(applyMultiAuthThreadRoutingPatch, source);
  assert.match(
    patched,
    /modelProvider:P\.modelProvider\?\?`codex-multi-auth-runtime-proxy`/,
  );
  assert.match(
    patched,
    /thread\/fork`,\{threadId:t,modelProvider:`codex-multi-auth-runtime-proxy`,path:/,
  );
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
      ["main-bundle", "extracted-app:post-webview", "webview-asset", "webview-asset"],
    );
  } finally {
    if (previous == null) delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    else process.env.CODEX_LINUX_FEATURES_CONFIG = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
