#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");
const {
  applyFarfieldBridgePatch,
  applyFarfieldComposerPatch,
  applyFarfieldProtocolPatch,
} = require("./patch.js");

const versionNeedle = '"thread-follower-compact-thread":1,"thread-follower-steer-turn":1';
const dispatcherNeedle = 'case`thread-follower-compact-thread-request`:try{let t=await ql(`thread-follower-compact-thread-for-host`,{hostId:e.hostId,...e.params});wl.dispatchMessage(`thread-follower-compact-thread-response`,{requestId:e.requestId,result:t})}catch(t){let n=t;wl.dispatchMessage(`thread-follower-compact-thread-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-steer-turn-request`:';
const ownerNeedle = '"thread-follower-compact-thread-for-host":r9(async(e,t)=>(e.assertThreadFollowerOwner(t.conversationId),await e.compactThread(t.conversationId),{ok:!0})),"thread-follower-edit-last-user-turn-for-host"';
const composerNeedle = 'go=Tm(async e=>{if(!mo||z==null||T==null)return unavailable;let r=await T({sourceConversationId:z});return r}),{onOpen:_o,onOpenQuickChat:vo,onOpenSideChat:yo}=UGa';

function currentBundleFixture() {
  return [dispatcherNeedle, ownerNeedle].join(";");
}

test("registers the targeted follower method version", () => {
  const patched = applyFarfieldProtocolPatch(versionNeedle);

  assert.match(patched, /codexLinuxFarfieldProtocol/);
  assert.match(patched, /"thread-follower-open-side-chat":1/);
  assert.equal(applyFarfieldProtocolPatch(patched), patched);
});

test("bridges one targeted follower request to the existing empty side-task callback", () => {
  const patched = applyFarfieldBridgePatch(currentBundleFixture());

  assert.match(patched, /codexLinuxFarfieldBridge/);
  assert.match(patched, /case`thread-follower-open-side-chat-request`/);
  assert.match(patched, /`thread-follower-open-side-chat-for-host`/);
  assert.match(patched, /`thread-follower-open-side-chat-response`/);
  assert.match(patched, /assertThreadFollowerOwner\(t\.conversationId\)/);
  assert.match(patched, /codexLinuxFarfieldSideChatHandlers\?\.get\(t\.conversationId\)/);
  assert.match(patched, /await n\(null\)/);
  assert.match(patched, /return\{conversationId:r\}/);
  assert.equal((patched.match(/thread-follower-open-side-chat-request/g) ?? []).length, 1);
  assert.equal(applyFarfieldBridgePatch(patched), patched);
});

test("registers and cleans up the existing empty side-task callback", () => {
  const patched = applyFarfieldComposerPatch(composerNeedle);

  assert.match(patched, /codexLinuxFarfieldComposer/);
  assert.match(patched, /Z9\.useEffect/);
  assert.match(patched, /\.set\(z,go\)/);
  assert.match(patched, /\.delete\(z\)/);
  assert.equal(applyFarfieldComposerPatch(patched), patched);
});

test("warns and leaves a drifted bundle unchanged", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const source = "current-matching-asset-with-upstream-drift";
    assert.equal(applyFarfieldBridgePatch(source), source);
    assert.equal(applyFarfieldComposerPatch(source), source);
    assert.equal(applyFarfieldProtocolPatch(source), source);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 3);
  assert.ok(warnings.every((warning) => warning.includes("WARN:")));
});

test("registers optional webview descriptors only when enabled", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-farfield-bridge-"));
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
      JSON.stringify({ enabled: ["farfield-bridge"] }),
    );
    const descriptors = loadLinuxFeaturePatchDescriptors({
      featuresRoot: path.resolve(__dirname, ".."),
    });
    assert.equal(descriptors.length, 3);
    assert.ok(descriptors.every((descriptor) => descriptor.phase === "webview-asset"));
    assert.ok(descriptors.every((descriptor) => descriptor.ciPolicy === "optional"));
  } finally {
    if (previous == null) delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    else process.env.CODEX_LINUX_FEATURES_CONFIG = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
