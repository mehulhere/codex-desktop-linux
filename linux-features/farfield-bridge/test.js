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
  applyFarfieldExtractedRouterPatch,
  applyFarfieldMainProcessPatch,
  applyFarfieldProtocolPatch,
  applyFarfieldRouterPatch,
} = require("./patch.js");

const versionNeedle = '"thread-follower-set-queued-follow-ups-state":1,"thread-queued-followups-changed":1';
const dispatcherNeedle = 'case`thread-follower-set-queued-follow-ups-state-request`:try{let{conversationId:t,state:n}=e.params;await Oc(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t}),await mu(r,x.QUEUED_FOLLOW_UPS,n),um.dispatchMessage(`thread-queued-followups-changed`,{conversationId:t,messages:n[t]??[]}),um.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,result:{ok:!0}})}catch(t){let n=t;um.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-role-request`:';
const queueNeedle = 'function fhe(){let e=q(J),t=Eh(),{data:n}=Nu(x.QUEUED_FOLLOW_UPS)';
const composerRegistrationNeedle = ',{onOpen:Fs,onOpenQuickChat:Is,onOpenSideChat:Ls}=gq({scope:B,conversationId:K,';
const composerInputNeedle = 'onUserInput:()=>{Hi(B)}';
const composerSubmitRegistrationNeedle = '(0,wq.useEffect)(()=>{},[null,In])';
const composerTurnStartedNeedle =
  'onLocalTurnStarted:e=>{xn!=null&&e.threadId!=null&&e.turnId!=null&&HS(B,xn.itemId,e.threadId,e.turnId)},openSideChatFromComposer:Ps';
const composerQueuedFollowUpNeedle =
  'if(J){vC(A,{result:Ni.CODEX_REMOTE_SSH_MESSAGE_RESULT_QUEUED,submitAction:X}),u(k.enqueue({text:q,context:oe,cwd:M})?.id??null),n(),N(!1),U&&c();return}';
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
  'async connect(){if(this.disposed)return;try{await this.routerManager.startRouterIfNeeded()}catch(e){this.logger.warning(`Unable to start router if needed`,{safe:{},sensitive:{error:e}})}let e=N7();';

function currentBundleFixture() {
  return [dispatcherNeedle, queueNeedle].join(";");
}

function requestCaseSource(source, method) {
  const start = source.indexOf(`case\`${method}-request\``);
  const end = source.indexOf("break bb38", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("registers acknowledged queue and draft follower method versions", () => {
  const patched = applyFarfieldProtocolPatch(versionNeedle);

  assert.match(patched, /codexLinuxFarfieldProtocol/);
  assert.match(patched, /"thread-follower-open-side-chat":1/);
  assert.match(patched, /"thread-follower-append-queued-follow-up":1/);
  assert.match(patched, /"thread-follower-read-composer-draft":1/);
  assert.match(patched, /"thread-follower-set-composer-draft":1/);
  assert.match(patched, /"thread-follower-type-and-submit-message":1/);
  assert.match(patched, /"thread-follower-refresh-conversation":1/);
  assert.match(patched, /"thread-composer-draft-changed":1/);
  assert.equal(applyFarfieldProtocolPatch(patched), patched);
});

test("bridges acknowledged per-thread queue, draft, and takeover requests", () => {
  const patched = applyFarfieldBridgePatch(currentBundleFixture());

  assert.match(patched, /codexLinuxFarfieldBridge/);
  assert.match(patched, /case`thread-follower-append-queued-follow-up-request`/);
  assert.match(patched, /case`thread-follower-read-composer-draft-request`/);
  assert.match(patched, /case`thread-follower-set-composer-draft-request`/);
  assert.match(patched, /case`thread-follower-type-and-submit-message-request`/);
  assert.match(patched, /assert-thread-follower-owner-for-host/);
  assert.match(patched, /codexLinuxFarfieldAppendQueuedFollowUp/);
  assert.match(patched, /codexLinuxFarfieldReadDraft/);
  assert.match(patched, /codexLinuxFarfieldSetDraft/);
  assert.match(patched, /thread-follower-append-queued-follow-up-response/);
  assert.match(patched, /thread-follower-read-composer-draft-response/);
  assert.match(patched, /thread-follower-set-composer-draft-response/);
  assert.match(patched, /thread-follower-type-and-submit-message-response/);
  assert.doesNotMatch(patched, /case`thread-follower-refresh-conversation-request`/);
  assert.doesNotMatch(patched, /thread-follower-refresh-conversation-response/);
  assert.doesNotMatch(patched, /location\.reload\(\)/);
  assert.match(patched, /dispatchHostMessage\(\{type:`navigate-to-route`,path:`\/local\/\$\{encodeURIComponent\(t\)\}`/);
  assert.match(patched, /codexLinuxFarfieldTakeoverSubmitHandlers/);
  assert.match(patched, /await new Promise\(e=>setTimeout\(e,50\)\)/);
  assert.match(patched, /result:\{conversationId:t,submitted:!0\}/);
  assert.match(patched, /await mu\(e,x\.QUEUED_FOLLOW_UPS,s\)/);
  assert.match(patched, /some\(e=>e\.id===n\.id\)/);
  assert.match(patched, /thread-queued-followups-changed/);
  assert.doesNotMatch(
    requestCaseSource(patched, "thread-follower-read-composer-draft"),
    /assert-thread-follower-owner-for-host/,
  );
  assert.doesNotMatch(
    requestCaseSource(patched, "thread-follower-set-composer-draft"),
    /assert-thread-follower-owner-for-host/,
  );
  assert.equal(applyFarfieldBridgePatch(patched), patched);
});

test("registers the native composer and publishes local draft changes", () => {
  const patched = applyFarfieldComposerPatch(
    [
      composerRegistrationNeedle,
      composerInputNeedle,
      `function uM(){let T={};${composerQueuedFollowUpNeedle}};Js=async(e={})=>{uM({${composerTurnStartedNeedle},options:e})},Ys=Yc(Js)`,
      composerSubmitRegistrationNeedle,
    ].join(";")
  );

  assert.match(patched, /codexLinuxFarfieldComposer/);
  assert.match(patched, /codexLinuxFarfieldRegisterComposer/);
  assert.match(patched, /codexLinuxFarfieldPublishLocalDraft/);
  assert.match(patched, /In\.getPersistedText\(\)/);
  assert.match(patched, /\.setText/);
  assert.match(patched, /localStorage\.setItem/);
  assert.match(patched, /thread-composer-draft-changed/);
  assert.match(patched, /setTimeout/);
  assert.match(patched, /codexLinuxFarfieldRegisterTakeoverSubmit/);
  assert.match(patched, /In\.setText\(e\)/);
  assert.match(
    patched,
    /await Ys\(\{promptRawOverride:e,persistedPromptRawOverride:e,focusComposerAfterSubmit:!0,onLocalTurnStarted:e=>\{t=e\},onQueuedFollowUp:e=>\{t=\{threadId:K,queuedFollowUpId:e\}\}\}\)/,
  );
  assert.ok(
    patched.indexOf("Ys=Yc(Js)") <
      patched.indexOf("codexLinuxFarfieldTakeoverSubmitRegistration"),
  );
  assert.equal(applyFarfieldComposerPatch(patched), patched);
});

test("acknowledges takeover only after the native composer starts or queues it", () => {
  const patched = applyFarfieldComposerPatch(
    [
      composerRegistrationNeedle,
      composerInputNeedle,
      `function uM(){let T={};${composerQueuedFollowUpNeedle}};Js=async(e={})=>{uM({${composerTurnStartedNeedle},options:e})},Ys=Yc(Js)`,
      composerSubmitRegistrationNeedle,
    ].join(";"),
  );

  assert.match(
    patched,
    /if\(K==null\|\|Us\.type!==`local`\|\|fs!=null&&fs!==`empty-message`\)return/,
  );
  assert.doesNotMatch(patched, /ys!==`submit`/);
  assert.match(patched, /e\.onLocalTurnStarted\?\.\(t\)/);
  assert.match(patched, /onLocalTurnStarted:e=>\{t=e\}/);
  assert.match(patched, /onQueuedFollowUp:e=>\{t=\{threadId:K,queuedFollowUpId:e\}\}/);
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
    /`thread-follower-set-composer-draft`,`thread-follower-type-and-submit-message`\]\)r\.add\(t\.addRequestHandler\(n,a,/,
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
    /`thread-follower-read-composer-draft`/,
  );
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
  assert.match(patched, /await globalThis\.codexLinuxFarfieldRouterStartPromise/);
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

test("warns and leaves a drifted bundle unchanged", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const source = "current-matching-asset-with-upstream-drift";
    assert.equal(applyFarfieldBridgePatch(source), source);
    assert.equal(applyFarfieldComposerPatch(source), source);
    assert.equal(applyFarfieldMainProcessPatch(source), source);
    assert.equal(applyFarfieldProtocolPatch(source), source);
    assert.equal(applyFarfieldRouterPatch(source), source);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 5);
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
    assert.equal(descriptors.length, 5);
    assert.equal(descriptors[0].phase, "main-bundle");
    assert.equal(descriptors[1].phase, "extracted-app:post-webview");
    assert.ok(descriptors.slice(2).every((descriptor) => descriptor.phase === "webview-asset"));
    assert.ok(descriptors.every((descriptor) => descriptor.ciPolicy === "optional"));
    assert.ok(
      descriptors[2].pattern.test(
        "app-initial~app-main~new-thread-panel-page~onboarding-page~appgen-library-page~hotkey-windo~d4kxte0o-BsjKAgmz.js",
      ),
    );
    assert.equal(
      descriptors[2].pattern.test(
        "app-initial~app-main~new-thread-panel-page~onboarding-page~appgen-library-page~hotkey-windo~nrw3o0ql-BmMR41j4.js",
      ),
      false,
    );
    assert.ok(descriptors[3].pattern.test("app-initial~app-main~page-Bca1Wu86.js"));
    assert.ok(
      descriptors[4].pattern.test(
        "app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~iufn7mg3-DRU9Ekz0.js",
      ),
    );
    assert.equal(
      descriptors[4].pattern.test(
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
