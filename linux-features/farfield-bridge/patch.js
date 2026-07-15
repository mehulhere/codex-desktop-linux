"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BRIDGE_MARKER = "codexLinuxFarfieldBridge";
const COMPOSER_MARKER = "codexLinuxFarfieldComposer";
const MAIN_PROCESS_MARKER = "codexLinuxFarfieldMainProcess";
const PROTOCOL_MARKER = "codexLinuxFarfieldProtocol";
const QUEUE_MARKER = "codexLinuxFarfieldQueue";
const ROUTER_MARKER = "codexLinuxFarfieldRouter";

const ROUTER_NEEDLE =
  'async connect(){if(this.disposed)return;try{await this.routerManager.startRouterIfNeeded()}catch(e){this.logger.warning(`Unable to start router if needed`,{safe:{},sensitive:{error:e}})}let e=F7();';
const ROUTER_REPLACEMENT =
  'async connect(){if(this.disposed)return;let t=globalThis.codexLinuxFarfieldRouterStartPromise??=this.routerManager.startRouterIfNeeded();try{await t}catch(e){this.logger.warning(`Unable to start router if needed`,{safe:{},sensitive:{error:e}})}finally{globalThis.codexLinuxFarfieldRouterStartPromise===t&&(globalThis.codexLinuxFarfieldRouterStartPromise=null)}let e=F7();';

const MAIN_METHOD_MAP_NEEDLE =
  '"thread-follower-set-queued-follow-ups-state":`thread-follower-set-queued-follow-ups-state-request`},G$=class{';
const MAIN_METHOD_MAP_REPLACEMENT =
  '"thread-follower-set-queued-follow-ups-state":`thread-follower-set-queued-follow-ups-state-request`,"thread-follower-open-side-chat":`thread-follower-open-side-chat-request`,"thread-follower-append-queued-follow-up":`thread-follower-append-queued-follow-up-request`,"thread-follower-type-and-submit-message":`thread-follower-type-and-submit-message-request`},G$=class{';
const MAIN_PENDING_MAP_NEEDLE =
  'pendingThreadFollowerSetQueuedFollowUpsStateRequests=new Map;pendingThreadRoleRequests=new Map;';
const MAIN_PENDING_MAP_REPLACEMENT =
  'pendingThreadFollowerSetQueuedFollowUpsStateRequests=new Map;pendingCodexLinuxFarfieldRequests=new Map;pendingThreadRoleRequests=new Map;';
const MAIN_REQUEST_NEEDLE =
  'async handleThreadFollowerSetQueuedFollowUpsStateRequest(e,t){return this.forwardThreadFollowerRequest(e,t,this.pendingThreadFollowerSetQueuedFollowUpsStateRequests,`thread-follower-set-queued-follow-ups-state-timeout`)}rejectPendingThreadFollowerActionRequestsForOrigin(e){';
const MAIN_REQUEST_REPLACEMENT =
  'async handleThreadFollowerSetQueuedFollowUpsStateRequest(e,t){return this.forwardThreadFollowerRequest(e,t,this.pendingThreadFollowerSetQueuedFollowUpsStateRequests,`thread-follower-set-queued-follow-ups-state-timeout`)}async handleCodexLinuxFarfieldRequest(e,t){return this.forwardThreadFollowerRequest(e,t,this.pendingCodexLinuxFarfieldRequests,`codex-linux-farfield-request-timeout`,14e3)}rejectPendingThreadFollowerActionRequestsForOrigin(e){for(let[t,n]of this.pendingCodexLinuxFarfieldRequests.entries())n.originId===e.id&&(clearTimeout(n.timeout),n.reject(Error(`webcontents-destroyed`)),this.pendingCodexLinuxFarfieldRequests.delete(t));';
const MAIN_RESPONSE_CASE_NEEDLE =
  'case`thread-follower-set-queued-follow-ups-state-response`:this.handleThreadFollowerSetQueuedFollowUpsStateResponse(e,t);break;case`thread-role-response`:';
const MAIN_RESPONSE_CASE_REPLACEMENT =
  'case`thread-follower-set-queued-follow-ups-state-response`:this.handleThreadFollowerSetQueuedFollowUpsStateResponse(e,t);break;case`thread-follower-open-side-chat-response`:case`thread-follower-append-queued-follow-up-response`:case`thread-follower-type-and-submit-message-response`:this.handleCodexLinuxFarfieldResponse(e,t);break;case`thread-role-response`:';
const MAIN_RESPONSE_NEEDLE = 'handleThreadRoleResponse(e,t){';
const MAIN_RESPONSE_REPLACEMENT =
  'handleCodexLinuxFarfieldResponse(e,t){let n=String(t.requestId),r=this.pendingCodexLinuxFarfieldRequests.get(n);if(!r||r.originId!==e.id)return;if(this.pendingCodexLinuxFarfieldRequests.delete(n),clearTimeout(r.timeout),t.error){r.reject(Error(t.error));return}if(!t.result){r.reject(Error(`Missing Codex Linux Farfield response`));return}r.resolve(t.result)}handleThreadRoleResponse(e,t){';
const MAIN_REGISTRATION_NEEDLE =
  'r.add(t.addRequestHandler(`thread-follower-set-queued-follow-ups-state`,i,async t=>this.messageHandler.handleThreadFollowerSetQueuedFollowUpsStateRequest(e,t))),r.add(()=>t.dispose())';
const MAIN_REGISTRATION_REPLACEMENT =
  'r.add(t.addRequestHandler(`thread-follower-set-queued-follow-ups-state`,i,async t=>this.messageHandler.handleThreadFollowerSetQueuedFollowUpsStateRequest(e,t)));let a=async()=>this.options.windowManager.getPrimaryWindow()?.webContents.id===e.id;for(let n of[`thread-follower-open-side-chat`,`thread-follower-append-queued-follow-up`,`thread-follower-type-and-submit-message`])r.add(t.addRequestHandler(n,a,async t=>this.messageHandler.handleCodexLinuxFarfieldRequest(e,t)));r.add(t.addRequestHandler(`thread-follower-refresh-conversation`,async()=>!0,async t=>{let{conversationId:n}=t.params;if(typeof n!==`string`||n.length===0)throw Error(`Refresh conversationId is required.`);let r=c.BrowserWindow.getAllWindows().filter(n=>!n.isDestroyed()&&this.options.windowManager.isAppServiceWindow(n));if(r.length===0)throw Error(`No Desktop app window is available for refresh.`);setTimeout(()=>{for(let t of r)t.isDestroyed()||t.webContents.isDestroyed()||t.webContents.reload()},0);return{conversationId:n,refreshScheduled:!0}}));r.add(()=>t.dispose())';
const MAIN_REFRESH_PREDICATE_NEEDLE =
  'addRequestHandler(`thread-follower-refresh-conversation`,a,async t=>';
const MAIN_REFRESH_PREDICATE_REPLACEMENT =
  'addRequestHandler(`thread-follower-refresh-conversation`,async()=>!0,async t=>';
const MAIN_REFRESH_HANDLER_NEEDLE =
  'async t=>{if(typeof t.conversationId!==`string`||t.conversationId.length===0)throw Error(`Refresh conversationId is required.`);let n=c.BrowserWindow.getAllWindows().filter(n=>!n.isDestroyed()&&this.options.windowManager.isAppServiceWindow(n));if(n.length===0)throw Error(`No Desktop app window is available for refresh.`);setTimeout(()=>{for(let t of n)t.isDestroyed()||t.webContents.isDestroyed()||t.webContents.reload()},0);return{conversationId:t.conversationId,refreshScheduled:!0}}';
const MAIN_REFRESH_HANDLER_REPLACEMENT =
  'async t=>{let{conversationId:n}=t.params;if(typeof n!==`string`||n.length===0)throw Error(`Refresh conversationId is required.`);let r=c.BrowserWindow.getAllWindows().filter(n=>!n.isDestroyed()&&this.options.windowManager.isAppServiceWindow(n));if(r.length===0)throw Error(`No Desktop app window is available for refresh.`);setTimeout(()=>{for(let t of r)t.isDestroyed()||t.webContents.isDestroyed()||t.webContents.reload()},0);return{conversationId:n,refreshScheduled:!0}}';

const VERSION_NEEDLE =
  '"thread-follower-set-queued-follow-ups-state":1,"thread-queued-followups-changed":1';
const VERSION_REPLACEMENT =
  '"thread-follower-set-queued-follow-ups-state":1,"thread-follower-open-side-chat":1,"thread-follower-append-queued-follow-up":1,"thread-follower-type-and-submit-message":1,"thread-follower-refresh-conversation":1,"thread-queued-followups-changed":1';

const DISPATCHER_NEEDLE =
  'case`thread-follower-set-queued-follow-ups-state-request`:try{let{conversationId:t,state:n}=e.params;await b(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t}),await Ve(r,Lc.QUEUED_FOLLOW_UPS,n),il.dispatchMessage(`thread-queued-followups-changed`,{conversationId:t,messages:n[t]??[]}),il.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,result:{ok:!0}})}catch(t){let n=t;il.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-role-request`:';
const DISPATCHER_REPLACEMENT =
  'case`thread-follower-set-queued-follow-ups-state-request`:try{let{conversationId:t,state:n}=e.params;await b(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t}),await Ve(r,Lc.QUEUED_FOLLOW_UPS,n),il.dispatchMessage(`thread-queued-followups-changed`,{conversationId:t,messages:n[t]??[]}),il.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,result:{ok:!0}})}catch(t){let n=t;il.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-open-side-chat-request`:try{let{conversationId:t}=e.params;await b(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t});let n=globalThis.codexLinuxFarfieldSideChatHandlers?.get(t);if(n==null)throw Error(`Side task is unavailable for this conversation.`);let r=await n();if(r==null)throw Error(`Side task could not be opened.`);il.dispatchMessage(`thread-follower-open-side-chat-response`,{requestId:e.requestId,result:{conversationId:r}})}catch(t){let n=t;il.dispatchMessage(`thread-follower-open-side-chat-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-append-queued-follow-up-request`:try{let{conversationId:t,message:n}=e.params;await b(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t});let r=globalThis.codexLinuxFarfieldAppendQueuedFollowUp;if(r==null)throw Error(`Native queued follow-ups are unavailable.`);let i=await r(t,n);il.dispatchMessage(`thread-follower-append-queued-follow-up-response`,{requestId:e.requestId,result:i})}catch(t){let n=t;il.dispatchMessage(`thread-follower-append-queued-follow-up-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-type-and-submit-message-request`:try{let{conversationId:t,text:n}=e.params;if(typeof t!==`string`||t.length===0)throw Error(`Takeover conversationId is required.`);if(typeof n!==`string`||n.trim().length===0)throw Error(`Takeover message text is required.`);il.dispatchHostMessage({type:`navigate-to-route`,path:`/local/${encodeURIComponent(t)}`,state:{focusComposerNonce:Date.now()}});let r=Date.now()+1e4,i=null;for(;Date.now()<r;){if(i=globalThis.codexLinuxFarfieldTakeoverSubmitHandlers?.get(t),i!=null)break;await new Promise(e=>setTimeout(e,50))}if(i==null)throw Error(`Native composer did not become ready for this conversation.`);await i(n),il.dispatchMessage(`thread-follower-type-and-submit-message-response`,{requestId:e.requestId,result:{conversationId:t,submitted:!0}})}catch(t){let n=t;il.dispatchMessage(`thread-follower-type-and-submit-message-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-role-request`:';

const QUEUE_NEEDLE =
  'function Sat(e){let t=$r(br),n=mh(e),{data:r,isLoading:i}=f(Zn.QUEUED_FOLLOW_UPS),a=Ct(),o=kn(`get-global-state`,{key:Zn.QUEUED_FOLLOW_UPS}),s=(0,I5.useRef)({}),c=(0,I5.useRef)(0),l=(0,I5.useRef)(0),u=(0,I5.useRef)([]),d=(0,I5.useRef)(!1);(0,I5.useEffect)';
const QUEUE_REPLACEMENT =
  'function Sat(e){let t=$r(br),n=mh(e),{data:r,isLoading:i}=f(Zn.QUEUED_FOLLOW_UPS),a=Ct(),o=kn(`get-global-state`,{key:Zn.QUEUED_FOLLOW_UPS}),s=(0,I5.useRef)({}),c=(0,I5.useRef)(0),l=(0,I5.useRef)(0),u=(0,I5.useRef)([]),d=(0,I5.useRef)(!1),codexLinuxFarfieldQueueRegistration=(0,I5.useEffect)(()=>{let e=async(e,r)=>{let i=s.current,a=i[e]??[],o=a.some(e=>e.id===r.id)?a:[...a,r],c={...i,[e]:o};return s.current=c,await pe(t,Zn.QUEUED_FOLLOW_UPS,c),n.getStreamRole(e)?.role===`owner`&&sr.dispatchMessage(`thread-queued-followups-changed`,{conversationId:e,messages:o}),{messages:o}};return globalThis.codexLinuxFarfieldAppendQueuedFollowUp=e,()=>{globalThis.codexLinuxFarfieldAppendQueuedFollowUp===e&&delete globalThis.codexLinuxFarfieldAppendQueuedFollowUp}},[t,n]);(0,I5.useEffect)';

const COMPOSER_REGISTRATION_NEEDLE =
  ',Ls=Pa(async()=>{try{await _s(null)}catch(e){gs(e)}}),zs=Vz({conversationId:V,';
const COMPOSER_REGISTRATION_REPLACEMENT =
  ',Ls=Pa(async()=>{try{await _s(null)}catch(e){gs(e)}}),codexLinuxFarfieldComposerRegistration=(0,XY.useEffect)(()=>{if(V==null)return;return globalThis.codexLinuxFarfieldRegisterComposer(V,Fn,Ls)},[V,Fn,Ls]),zs=Vz({conversationId:V,';
const COMPOSER_SUBMIT_REGISTRATION_NEEDLE =
  '(0,XY.useEffect)(()=>{},[null,Fn])';
const COMPOSER_SUBMIT_REGISTRATION_REPLACEMENT =
  'let codexLinuxFarfieldTakeoverSubmitRegistration=(0,XY.useEffect)(()=>{if(V==null||Ts.type!==`local`||Zo!=null&&Zo!==`empty-message`)return;let e=async e=>{Fn.setText(e);let t=null;await js({promptRawOverride:e,persistedPromptRawOverride:e,focusComposerAfterSubmit:!0,onLocalTurnStarted:e=>{t=e},onQueuedFollowUp:e=>{t={threadId:V,queuedFollowUpId:e}}});if(t==null)throw Error(`Native composer did not accept the takeover message.`);return t};return globalThis.codexLinuxFarfieldRegisterTakeoverSubmit(V,e)},[V,Fn,js,Ts.type,Zo])';
const COMPOSER_TURN_STARTED_NEEDLE =
  'onLocalTurnStarted:e=>{xn!=null&&e.threadId!=null&&e.turnId!=null&&Vb(N,xn.itemId,e.threadId,e.turnId)},openSideChatFromComposer:_s';
const COMPOSER_TURN_STARTED_REPLACEMENT =
  'onLocalTurnStarted:t=>{xn!=null&&t.threadId!=null&&t.turnId!=null&&Vb(N,xn.itemId,t.threadId,t.turnId),e.onLocalTurnStarted?.(t)},openSideChatFromComposer:_s';
const COMPOSER_QUEUED_FOLLOW_UP_NEEDLE =
  'if(ie){yT(A,{result:wo.CODEX_REMOTE_SSH_MESSAGE_RESULT_QUEUED,submitAction:q}),u(k.enqueue({text:re,context:ue,cwd:M})?.id??null),n(),N(!1),U&&c();return}';
const COMPOSER_QUEUED_FOLLOW_UP_REPLACEMENT =
  'if(ie){yT(A,{result:wo.CODEX_REMOTE_SSH_MESSAGE_RESULT_QUEUED,submitAction:q});let e=k.enqueue({text:re,context:ue,cwd:M})?.id??null;u(e),e!=null&&T.onQueuedFollowUp?.(e),n(),N(!1),U&&c();return}';

const COMPOSER_BOOTSTRAP = String.raw`const codexLinuxFarfieldComposer=!0;(()=>{if(globalThis.codexLinuxFarfieldComposerBridgeInitialized)return;globalThis.codexLinuxFarfieldComposerBridgeInitialized=!0,globalThis.codexLinuxFarfieldSideChatHandlers??=new Map,globalThis.codexLinuxFarfieldTakeoverSubmitHandlers??=new Map,globalThis.codexLinuxFarfieldRegisterComposer=(e,t,n)=>(globalThis.codexLinuxFarfieldSideChatHandlers.set(e,n),()=>{globalThis.codexLinuxFarfieldSideChatHandlers.get(e)===n&&globalThis.codexLinuxFarfieldSideChatHandlers.delete(e)}),globalThis.codexLinuxFarfieldRegisterTakeoverSubmit=(e,t)=>(globalThis.codexLinuxFarfieldTakeoverSubmitHandlers.set(e,t),()=>{globalThis.codexLinuxFarfieldTakeoverSubmitHandlers.get(e)===t&&globalThis.codexLinuxFarfieldTakeoverSubmitHandlers.delete(e)})})();`;

function warn(message) {
  console.warn(`WARN: ${message} - skipping Farfield bridge patch`);
}

function applyFarfieldProtocolPatch(source) {
  if (source.includes(PROTOCOL_MARKER)) return source;
  if (!source.includes(VERSION_NEEDLE)) {
    warn("Could not find the current follower method version registry");
    return source;
  }
  return `const ${PROTOCOL_MARKER}=!0;${source.replace(VERSION_NEEDLE, VERSION_REPLACEMENT)}`;
}

function applyFarfieldMainProcessPatch(source) {
  if (source.includes(MAIN_PROCESS_MARKER)) {
    let patched = source;
    if (patched.includes(MAIN_REFRESH_HANDLER_NEEDLE)) {
      patched = patched.replace(MAIN_REFRESH_HANDLER_NEEDLE, MAIN_REFRESH_HANDLER_REPLACEMENT);
    }
    if (patched.includes(MAIN_REFRESH_PREDICATE_NEEDLE)) {
      patched = patched.replace(
        MAIN_REFRESH_PREDICATE_NEEDLE,
        MAIN_REFRESH_PREDICATE_REPLACEMENT,
      );
    }
    return patched;
  }
  const needles = [
    MAIN_METHOD_MAP_NEEDLE,
    MAIN_PENDING_MAP_NEEDLE,
    MAIN_REQUEST_NEEDLE,
    MAIN_RESPONSE_CASE_NEEDLE,
    MAIN_RESPONSE_NEEDLE,
    MAIN_REGISTRATION_NEEDLE,
  ];
  if (needles.some((needle) => !source.includes(needle))) {
    warn("Could not find the current Electron follower request bridge");
    return source;
  }

  let patched = source.replace(MAIN_METHOD_MAP_NEEDLE, MAIN_METHOD_MAP_REPLACEMENT);
  patched = patched.replace(MAIN_PENDING_MAP_NEEDLE, MAIN_PENDING_MAP_REPLACEMENT);
  patched = patched.replace(MAIN_REQUEST_NEEDLE, MAIN_REQUEST_REPLACEMENT);
  patched = patched.replace(MAIN_RESPONSE_CASE_NEEDLE, MAIN_RESPONSE_CASE_REPLACEMENT);
  patched = patched.replace(MAIN_RESPONSE_NEEDLE, MAIN_RESPONSE_REPLACEMENT);
  patched = patched.replace(MAIN_REGISTRATION_NEEDLE, MAIN_REGISTRATION_REPLACEMENT);
  return `const ${MAIN_PROCESS_MARKER}=!0;${patched}`;
}

function applyFarfieldRouterPatch(source) {
  if (source.includes(ROUTER_MARKER)) return source;
  if (!source.includes(ROUTER_NEEDLE) || !source.includes(VERSION_NEEDLE)) {
    warn("Could not find the current Linux IPC router startup and method versions");
    return source;
  }
  let patched = source.replace(ROUTER_NEEDLE, ROUTER_REPLACEMENT);
  patched = patched.replace(VERSION_NEEDLE, VERSION_REPLACEMENT);
  return `const ${ROUTER_MARKER}=!0;${patched}`;
}

function applyFarfieldExtractedRouterPatch(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    return { matched: false, changed: 0, reason: "Vite build directory not found" };
  }

  const candidates = fs
    .readdirSync(buildDir)
    .filter((name) => name.startsWith("src-") && name.endsWith(".js"))
    .map((name) => {
      const filePath = path.join(buildDir, name);
      return { filePath, source: fs.readFileSync(filePath, "utf8") };
    });
  const alreadyPatched = candidates.filter(({ source }) => source.includes(ROUTER_MARKER));
  if (alreadyPatched.length === 1) {
    return { matched: true, changed: 0 };
  }
  const matches = candidates.filter(
    ({ source }) => source.includes(ROUTER_NEEDLE) && source.includes(VERSION_NEEDLE),
  );
  if (matches.length !== 1) {
    return {
      matched: false,
      changed: 0,
      reason: `Expected one Linux IPC router bundle, found ${String(matches.length)}`,
    };
  }

  const [{ filePath, source }] = matches;
  fs.writeFileSync(filePath, applyFarfieldRouterPatch(source), "utf8");
  return { matched: true, changed: 1 };
}

function applyFarfieldDispatcherPatch(source) {
  if (source.includes(BRIDGE_MARKER)) return source;
  if (!source.includes(DISPATCHER_NEEDLE)) {
    warn("Could not find the current follower request dispatcher");
    return source;
  }

  const patched = source.replace(DISPATCHER_NEEDLE, DISPATCHER_REPLACEMENT);
  return `const ${BRIDGE_MARKER}=!0;${patched}`;
}

function applyFarfieldQueuePatch(source) {
  if (source.includes(QUEUE_MARKER)) return source;
  if (!source.includes(QUEUE_NEEDLE)) {
    warn("Could not find the current native queued follow-up hook");
    return source;
  }

  return `const ${QUEUE_MARKER}=!0;${source.replace(QUEUE_NEEDLE, QUEUE_REPLACEMENT)}`;
}

function applyFarfieldComposerPatch(source) {
  if (source.includes(COMPOSER_MARKER)) return source;
  if (
    !source.includes(COMPOSER_REGISTRATION_NEEDLE) ||
    !source.includes(COMPOSER_SUBMIT_REGISTRATION_NEEDLE) ||
    !source.includes(COMPOSER_TURN_STARTED_NEEDLE) ||
    !source.includes(COMPOSER_QUEUED_FOLLOW_UP_NEEDLE)
  ) {
    warn("Could not find the current native composer registration and submit hooks");
    return source;
  }

  let patched = source.replace(
    COMPOSER_REGISTRATION_NEEDLE,
    COMPOSER_REGISTRATION_REPLACEMENT,
  );
  patched = patched.replace(COMPOSER_TURN_STARTED_NEEDLE, COMPOSER_TURN_STARTED_REPLACEMENT);
  patched = patched.replace(
    COMPOSER_QUEUED_FOLLOW_UP_NEEDLE,
    COMPOSER_QUEUED_FOLLOW_UP_REPLACEMENT,
  );
  patched = patched.replace(
    COMPOSER_SUBMIT_REGISTRATION_NEEDLE,
    COMPOSER_SUBMIT_REGISTRATION_REPLACEMENT,
  );
  return `${COMPOSER_BOOTSTRAP}${patched}`;
}

module.exports = {
  applyFarfieldComposerPatch,
  applyFarfieldDispatcherPatch,
  applyFarfieldExtractedRouterPatch,
  applyFarfieldMainProcessPatch,
  applyFarfieldProtocolPatch,
  applyFarfieldQueuePatch,
  applyFarfieldRouterPatch,
  descriptors: [
    {
      id: "desktop-farfield-main-process",
      phase: "main-bundle",
      order: 20_758,
      ciPolicy: "optional",
      skipDescription: "Farfield Electron request bridge needles drifted upstream",
      apply: applyFarfieldMainProcessPatch,
    },
    {
      id: "desktop-farfield-router-startup",
      phase: "extracted-app:post-webview",
      order: 20_758,
      ciPolicy: "optional",
      apply: applyFarfieldExtractedRouterPatch,
      status: (result, warnings) => ({
        status: result?.changed
          ? "applied"
          : result?.matched
            ? "already-applied"
            : "skipped-optional",
        reason: result?.reason ?? warnings[0] ?? null,
      }),
    },
    {
      id: "desktop-farfield-follower-versions",
      phase: "webview-asset",
      order: 20_759,
      ciPolicy: "optional",
      pattern:
        /^app-initial~app-main~hotkey-window-new-thread-page~hotkey-window-home-page~composer-utility-bar-[^.]+\.js$/,
      missingDescription: "current Desktop follower protocol bundle",
      skipDescription: "Farfield follower method version needle drifted upstream",
      apply: applyFarfieldProtocolPatch,
    },
    {
      id: "desktop-farfield-follower-requests",
      phase: "webview-asset",
      order: 20_760,
      ciPolicy: "optional",
      pattern: /^app-initial~app-main~page-.*\.js$/,
      missingDescription: "current Desktop page bundle",
      skipDescription: "Farfield follower request or queue hook needles drifted upstream",
      apply: applyFarfieldDispatcherPatch,
    },
    {
      id: "desktop-farfield-native-queue",
      phase: "webview-asset",
      order: 20_761,
      ciPolicy: "optional",
      pattern:
        /^app-initial~app-main~new-thread-panel-page~onboarding-page~appgen-library-page~hotkey-windo~nrw3o0ql-[^.]+\.js$/,
      missingDescription: "current Desktop queued follow-up bundle",
      skipDescription: "Farfield native queue hook drifted upstream",
      apply: applyFarfieldQueuePatch,
    },
    {
      id: "desktop-farfield-composer-registration",
      phase: "webview-asset",
      order: 20_762,
      ciPolicy: "optional",
      pattern:
        /^app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~iufn7mg3-[^.]+\.js$/,
      missingDescription: "current Desktop page composer bundle",
      skipDescription: "Farfield native composer hooks drifted upstream",
      apply: applyFarfieldComposerPatch,
    },
  ],
};
