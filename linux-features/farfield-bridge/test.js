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
  applyFarfieldComposerPatch,
  applyFarfieldDispatcherPatch,
  applyFarfieldExtractedRouterPatch,
  applyFarfieldMainProcessPatch,
  applyFarfieldProtocolPatch,
  applyFarfieldQueuePatch,
  applyFarfieldRouterPatch,
} = require("./patch.js");
const { verifyFarfieldPatchReport } = require("./verify-build.js");

const requiredPatchNames = [
  "desktop-farfield-main-process",
  "desktop-farfield-router-startup",
  "desktop-farfield-follower-versions",
  "desktop-farfield-follower-requests",
  "desktop-farfield-native-queue",
  "desktop-farfield-composer-registration",
];

const versionNeedle = '"thread-follower-set-queued-follow-ups-state":1,"thread-queued-followups-changed":1';
const dispatcherNeedle = 'case`thread-follower-set-queued-follow-ups-state-request`:try{let{conversationId:t,state:n}=e.params;await b(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t}),await Ve(r,Lc.QUEUED_FOLLOW_UPS,n),il.dispatchMessage(`thread-queued-followups-changed`,{conversationId:t,messages:n[t]??[]}),il.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,result:{ok:!0}})}catch(t){let n=t;il.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-role-request`:';
const queueNeedle = 'function Sat(e){let t=$r(br),n=mh(e),{data:r,isLoading:i}=f(Zn.QUEUED_FOLLOW_UPS),a=Ct(),o=kn(`get-global-state`,{key:Zn.QUEUED_FOLLOW_UPS}),s=(0,I5.useRef)({}),c=(0,I5.useRef)(0),l=(0,I5.useRef)(0),u=(0,I5.useRef)([]),d=(0,I5.useRef)(!1);(0,I5.useEffect)';
const composerRegistrationNeedle = ',Ls=Pa(async()=>{try{await _s(null)}catch(e){gs(e)}}),zs=Vz({conversationId:V,';
const composerSubmitRegistrationNeedle = '(0,XY.useEffect)(()=>{},[null,Fn])';
const composerTurnStartedNeedle =
  'onLocalTurnStarted:e=>{xn!=null&&e.threadId!=null&&e.turnId!=null&&Vb(N,xn.itemId,e.threadId,e.turnId)},openSideChatFromComposer:_s';
const composerQueuedFollowUpNeedle =
  'if(ie){yT(A,{result:wo.CODEX_REMOTE_SSH_MESSAGE_RESULT_QUEUED,submitAction:q}),u(k.enqueue({text:re,context:ue,cwd:M})?.id??null),n(),N(!1),U&&c();return}';
const mainMethodMapNeedle =
  '"thread-follower-set-queued-follow-ups-state":`thread-follower-set-queued-follow-ups-state-request`},G$=class{';
const mainPendingMapNeedle =
  'pendingThreadFollowerSetQueuedFollowUpsStateRequests=new Map;pendingThreadRoleRequests=new Map;';
const mainRequestNeedle =
  'async handleThreadFollowerSetQueuedFollowUpsStateRequest(e,t){return this.forwardThreadFollowerRequest(e,t,this.pendingThreadFollowerSetQueuedFollowUpsStateRequests,`thread-follower-set-queued-follow-ups-state-timeout`)}rejectPendingThreadFollowerActionRequestsForOrigin(e){';
const mainResponseCaseNeedle =
  'case`thread-follower-set-queued-follow-ups-state-response`:this.handleThreadFollowerSetQueuedFollowUpsStateResponse(e,t);break;case`thread-role-response`:';
const mainResponseNeedle =
  'handleThreadFollowerSetQueuedFollowUpsStateResponse(e,t){let n=String(t.requestId),r=this.pendingThreadFollowerSetQueuedFollowUpsStateRequests.get(n);if(!r||r.originId!==e.id)return;if(this.pendingThreadFollowerSetQueuedFollowUpsStateRequests.delete(n),clearTimeout(r.timeout),t.error){r.reject(Error(t.error));return}if(!t.result){r.reject(Error(`Missing thread follower queued follow-ups response`));return}r.resolve(t.result)}handleThreadRoleResponse(e,t){';
const mainRegistrationNeedle =
  'r.add(t.addRequestHandler(`thread-follower-set-queued-follow-ups-state`,i,async t=>this.messageHandler.handleThreadFollowerSetQueuedFollowUpsStateRequest(e,t))),r.add(()=>t.dispose())';
const routerNeedle =
  'async connect(){if(this.disposed)return;try{await this.routerManager.startRouterIfNeeded()}catch(e){this.logger.warning(`Unable to start router if needed`,{safe:{},sensitive:{error:e}})}let e=F7();';

function requestCaseSource(source, method) {
  const start = source.indexOf(`case\`${method}-request\``);
  const end = source.indexOf("break bb38", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

function reportWith(statusByName = {}) {
  return {
    enabledFeatures: ["farfield-bridge"],
    patches: requiredPatchNames.map((name) => ({
      name: `feature:farfield-bridge:${name}`,
      featureId: "farfield-bridge",
      status: statusByName[name] ?? "applied",
    })),
  };
}

test("registers acknowledged queue, takeover, refresh, and side-task method versions", () => {
  const patched = applyFarfieldProtocolPatch(versionNeedle);

  assert.match(patched, /codexLinuxFarfieldProtocol/);
  assert.match(patched, /"thread-follower-open-side-chat":1/);
  assert.match(patched, /"thread-follower-append-queued-follow-up":1/);
  assert.match(patched, /"thread-follower-type-and-submit-message":1/);
  assert.match(patched, /"thread-follower-refresh-conversation":1/);
  assert.doesNotMatch(patched, /composer-draft/);
  assert.equal(applyFarfieldProtocolPatch(patched), patched);
});

test("bridges acknowledged per-thread queue and takeover requests", () => {
  const patched = applyFarfieldDispatcherPatch(dispatcherNeedle);

  assert.match(patched, /codexLinuxFarfieldBridge/);
  assert.match(patched, /case`thread-follower-append-queued-follow-up-request`/);
  assert.match(patched, /case`thread-follower-type-and-submit-message-request`/);
  assert.match(patched, /assert-thread-follower-owner-for-host/);
  assert.match(patched, /codexLinuxFarfieldAppendQueuedFollowUp/);
  assert.match(patched, /thread-follower-append-queued-follow-up-response/);
  assert.match(patched, /thread-follower-type-and-submit-message-response/);
  assert.doesNotMatch(patched, /case`thread-follower-refresh-conversation-request`/);
  assert.doesNotMatch(patched, /thread-follower-refresh-conversation-response/);
  assert.doesNotMatch(patched, /location\.reload\(\)/);
  assert.match(patched, /dispatchHostMessage\(\{type:`navigate-to-route`,path:`\/local\/\$\{encodeURIComponent\(t\)\}`/);
  assert.match(patched, /codexLinuxFarfieldTakeoverSubmitHandlers/);
  assert.match(patched, /await new Promise\(e=>setTimeout\(e,50\)\)/);
  assert.match(patched, /result:\{conversationId:t,submitted:!0\}/);
  assert.equal(applyFarfieldDispatcherPatch(patched), patched);
});

test("registers the native queue hook in its current upstream bundle", () => {
  const patched = applyFarfieldQueuePatch(queueNeedle);

  assert.match(patched, /codexLinuxFarfieldQueue/);
  assert.match(patched, /codexLinuxFarfieldAppendQueuedFollowUp/);
  assert.match(patched, /await pe\(t,Zn\.QUEUED_FOLLOW_UPS,c\)/);
  assert.match(patched, /some\(e=>e\.id===r\.id\)/);
  assert.match(patched, /thread-queued-followups-changed/);
  assert.equal(applyFarfieldQueuePatch(patched), patched);
});

test("registers native side-task and takeover handlers without draft synchronization", () => {
  const patched = applyFarfieldComposerPatch(
    [
      composerRegistrationNeedle,
      `function uM(){let T={};${composerQueuedFollowUpNeedle}};As=async(e={})=>{uM({${composerTurnStartedNeedle},options:e})},js=Pa(As)`,
      composerSubmitRegistrationNeedle,
    ].join(";")
  );

  assert.match(patched, /codexLinuxFarfieldComposer/);
  assert.match(patched, /codexLinuxFarfieldRegisterComposer/);
  assert.doesNotMatch(patched, /localStorage/);
  assert.doesNotMatch(patched, /thread-composer-draft-changed/);
  assert.match(patched, /codexLinuxFarfieldRegisterTakeoverSubmit/);
  assert.match(patched, /Fn\.setText\(e\)/);
  assert.match(
    patched,
    /await js\(\{promptRawOverride:e,persistedPromptRawOverride:e,focusComposerAfterSubmit:!0,onLocalTurnStarted:e=>\{t=e\},onQueuedFollowUp:e=>\{t=\{threadId:V,queuedFollowUpId:e\}\}\}\)/,
  );
  assert.ok(
    patched.indexOf("js=Pa(As)") <
      patched.indexOf("codexLinuxFarfieldTakeoverSubmitRegistration"),
  );
  assert.equal(applyFarfieldComposerPatch(patched), patched);
});

test("acknowledges takeover only after the native composer starts or queues it", () => {
  const patched = applyFarfieldComposerPatch(
    [
      composerRegistrationNeedle,
      `function uM(){let T={};${composerQueuedFollowUpNeedle}};As=async(e={})=>{uM({${composerTurnStartedNeedle},options:e})},js=Pa(As)`,
      composerSubmitRegistrationNeedle,
    ].join(";"),
  );

  assert.match(
    patched,
    /if\(V==null\|\|Ts\.type!==`local`\|\|Zo!=null&&Zo!==`empty-message`\)return/,
  );
  assert.doesNotMatch(patched, /ys!==`submit`/);
  assert.match(patched, /e\.onLocalTurnStarted\?\.\(t\)/);
  assert.match(patched, /onLocalTurnStarted:e=>\{t=e\}/);
  assert.match(patched, /onQueuedFollowUp:e=>\{t=\{threadId:V,queuedFollowUpId:e\}\}/);
  assert.match(patched, /T\.onQueuedFollowUp\?\.\(e\)/);
  assert.match(
    patched,
    /if\(t==null\)throw Error\(`Native composer did not accept the takeover message\.`\)/,
  );
  assert.match(patched, /return t/);
});

test("forwards composer requests to the primary renderer and refreshes all app windows", () => {
  const fixture = [
    mainMethodMapNeedle,
    mainPendingMapNeedle,
    mainRequestNeedle,
    mainResponseCaseNeedle,
    mainResponseNeedle,
    mainRegistrationNeedle,
  ].join(";");
  const patched = applyFarfieldMainProcessPatch(fixture);

  assert.match(patched, /codexLinuxFarfieldMainProcess/);
  assert.match(
    patched,
    /"thread-follower-type-and-submit-message":`thread-follower-type-and-submit-message-request`/,
  );
  assert.doesNotMatch(
    patched,
    /"thread-follower-refresh-conversation":`thread-follower-refresh-conversation-request`/,
  );
  assert.match(patched, /pendingCodexLinuxFarfieldRequests=new Map/);
  assert.match(patched, /case`thread-follower-type-and-submit-message-response`/);
  assert.match(patched, /handleCodexLinuxFarfieldRequest/);
  assert.match(patched, /handleCodexLinuxFarfieldResponse/);
  assert.match(
    patched,
    /getPrimaryWindow\(\)\?\.webContents\.id===e\.id/,
  );
  assert.match(
    patched,
    /`thread-follower-append-queued-follow-up`,`thread-follower-type-and-submit-message`\]\)r\.add\(t\.addRequestHandler\(n,a,/,
  );
  assert.match(
    patched,
    /addRequestHandler\(`thread-follower-refresh-conversation`,async\(\)=>!0,async t=>/,
  );
  assert.match(patched, /let\{conversationId:n\}=t\.params/);
  assert.match(patched, /c\.BrowserWindow\.getAllWindows\(\)/);
  assert.match(patched, /windowManager\.isAppServiceWindow\(n\)/);
  assert.match(patched, /\.webContents\.reload\(\)/);
  assert.match(patched, /return\{conversationId:n,refreshScheduled:!0\}/);
  assert.doesNotMatch(patched, /thread-follower-refresh-conversation-response/);
  assert.match(
    patched,
    /`thread-follower-open-side-chat`/,
  );
  assert.doesNotMatch(patched, /composer-draft/);
  assert.match(patched, /webcontents-destroyed/);
  assert.equal(applyFarfieldMainProcessPatch(patched), patched);
});

test("upgrades the refresh handler in an already-patched Desktop bundle", () => {
  const oldRefreshHandler = 'addRequestHandler(`thread-follower-refresh-conversation`,a,async t=>{if(typeof t.conversationId!==`string`||t.conversationId.length===0)throw Error(`Refresh conversationId is required.`);let n=c.BrowserWindow.getAllWindows().filter(n=>!n.isDestroyed()&&this.options.windowManager.isAppServiceWindow(n));if(n.length===0)throw Error(`No Desktop app window is available for refresh.`);setTimeout(()=>{for(let t of n)t.isDestroyed()||t.webContents.isDestroyed()||t.webContents.reload()},0);return{conversationId:t.conversationId,refreshScheduled:!0}})';
  const source = `const codexLinuxFarfieldMainProcess=!0;${oldRefreshHandler}`;
  const patched = applyFarfieldMainProcessPatch(source);

  assert.match(patched, /let\{conversationId:n\}=t\.params/);
  assert.match(
    patched,
    /addRequestHandler\(`thread-follower-refresh-conversation`,async\(\)=>!0,async t=>/,
  );
  assert.doesNotMatch(patched, /typeof t\.conversationId/);
  assert.equal(applyFarfieldMainProcessPatch(patched), patched);
});

test("serializes Linux IPC router startup across Desktop windows", () => {
  const patched = applyFarfieldRouterPatch(`${routerNeedle};${versionNeedle}`);

  assert.match(patched, /codexLinuxFarfieldRouter/);
  assert.match(patched, /codexLinuxFarfieldRouterStartPromise/);
  assert.match(patched, /try\{await t\}/);
  assert.match(
    patched,
    /finally\{globalThis\.codexLinuxFarfieldRouterStartPromise===t&&\(globalThis\.codexLinuxFarfieldRouterStartPromise=null\)\}/,
  );
  assert.match(patched, /"thread-follower-type-and-submit-message":1/);
  assert.equal(applyFarfieldRouterPatch(patched), patched);
});

test("patches exactly one extracted IPC router bundle", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-farfield-router-"));
  const buildDir = path.join(temp, ".vite", "build");
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, "src-router.js"), `${routerNeedle};${versionNeedle}`);
  fs.writeFileSync(path.join(buildDir, "src-other.js"), "const unrelated=true;");
  try {
    assert.deepEqual(applyFarfieldExtractedRouterPatch(temp), {
      matched: true,
      changed: 1,
    });
    assert.match(
      fs.readFileSync(path.join(buildDir, "src-router.js"), "utf8"),
      /codexLinuxFarfieldRouterStartPromise/,
    );
    assert.deepEqual(applyFarfieldExtractedRouterPatch(temp), {
      matched: true,
      changed: 0,
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("accepts a build only when every Farfield patch applied", () => {
  assert.deepEqual(verifyFarfieldPatchReport(reportWith()), {
    enabled: true,
    verifiedPatchCount: 6,
  });
});

test("accepts idempotent Farfield patches reported as already applied", () => {
  assert.deepEqual(
    verifyFarfieldPatchReport(
      reportWith({ "desktop-farfield-router-startup": "already-applied" }),
    ),
    { enabled: true, verifiedPatchCount: 6 },
  );
});

test("fails when an enabled Farfield patch is skipped", () => {
  assert.throws(
    () =>
      verifyFarfieldPatchReport(
        reportWith({ "desktop-farfield-native-queue": "skipped-optional" }),
      ),
    /desktop-farfield-native-queue.*skipped-optional/,
  );
});

test("fails when an enabled Farfield patch is absent from the report", () => {
  const report = reportWith();
  report.patches = report.patches.filter(
    (patch) => !patch.name.endsWith(":desktop-farfield-composer-registration"),
  );

  assert.throws(
    () => verifyFarfieldPatchReport(report),
    /desktop-farfield-composer-registration.*missing/,
  );
});

test("does not gate builds where Farfield is disabled", () => {
  assert.deepEqual(
    verifyFarfieldPatchReport({ enabledFeatures: [], patches: [] }),
    { enabled: false, verifiedPatchCount: 0 },
  );
});

test("warns and leaves a drifted bundle unchanged", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const source = "current-matching-asset-with-upstream-drift";
    assert.equal(applyFarfieldDispatcherPatch(source), source);
    assert.equal(applyFarfieldQueuePatch(source), source);
    assert.equal(applyFarfieldComposerPatch(source), source);
    assert.equal(applyFarfieldMainProcessPatch(source), source);
    assert.equal(applyFarfieldProtocolPatch(source), source);
    assert.equal(applyFarfieldRouterPatch(source), source);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 6);
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
    assert.equal(descriptors.length, 6);
    assert.equal(descriptors[0].phase, "main-bundle");
    assert.equal(descriptors[1].phase, "extracted-app:post-webview");
    assert.ok(descriptors.slice(2).every((descriptor) => descriptor.phase === "webview-asset"));
    assert.ok(descriptors.every((descriptor) => descriptor.ciPolicy === "optional"));
    assert.ok(
      descriptors[2].pattern.test("app-initial~app-main~hotkey-window-new-thread-page~hotkey-window-home-page~composer-utility-bar-D9zyQF1n.js"),
    );
    assert.equal(
      descriptors[2].pattern.test(
        "app-initial~app-main~new-thread-panel-page~onboarding-page~appgen-library-page~hotkey-windo~nrw3o0ql-CI1_Z0oj.js",
      ),
      false,
    );
    assert.ok(descriptors[3].pattern.test("app-initial~app-main~page-Cmd9LUYY.js"));
    assert.ok(
      descriptors[4].pattern.test(
        "app-initial~app-main~new-thread-panel-page~onboarding-page~appgen-library-page~hotkey-windo~nrw3o0ql-CI1_Z0oj.js",
      ),
    );
    assert.ok(
      descriptors[5].pattern.test(
        "app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~iufn7mg3-DRU9Ekz0.js",
      ),
    );
    assert.equal(
      descriptors[5].pattern.test(
        "app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~lhgjoyjn-CMTECkzu.js",
      ),
      false,
    );
  } finally {
    if (previous == null) delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    else process.env.CODEX_LINUX_FEATURES_CONFIG = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
