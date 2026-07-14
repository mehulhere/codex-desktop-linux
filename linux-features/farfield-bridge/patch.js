"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BRIDGE_MARKER = "codexLinuxFarfieldBridge";
const COMPOSER_MARKER = "codexLinuxFarfieldComposer";
const MAIN_PROCESS_MARKER = "codexLinuxFarfieldMainProcess";
const PROTOCOL_MARKER = "codexLinuxFarfieldProtocol";
const ROUTER_MARKER = "codexLinuxFarfieldRouter";

const ROUTER_NEEDLE =
  'async connect(){if(this.disposed)return;try{await this.routerManager.startRouterIfNeeded()}catch(e){this.logger.warning(`Unable to start router if needed`,{safe:{},sensitive:{error:e}})}let e=N7();';
const ROUTER_REPLACEMENT =
  'async connect(){if(this.disposed)return;try{globalThis.codexLinuxFarfieldRouterStartPromise??=this.routerManager.startRouterIfNeeded(),await globalThis.codexLinuxFarfieldRouterStartPromise}catch(e){globalThis.codexLinuxFarfieldRouterStartPromise=null,this.logger.warning(`Unable to start router if needed`,{safe:{},sensitive:{error:e}})}let e=N7();';

const MAIN_METHOD_MAP_NEEDLE =
  '"thread-follower-set-queued-follow-ups-state":`thread-follower-set-queued-follow-ups-state-request`},G$=class{';
const MAIN_METHOD_MAP_REPLACEMENT =
  '"thread-follower-set-queued-follow-ups-state":`thread-follower-set-queued-follow-ups-state-request`,"thread-follower-open-side-chat":`thread-follower-open-side-chat-request`,"thread-follower-append-queued-follow-up":`thread-follower-append-queued-follow-up-request`,"thread-follower-read-composer-draft":`thread-follower-read-composer-draft-request`,"thread-follower-set-composer-draft":`thread-follower-set-composer-draft-request`,"thread-follower-type-and-submit-message":`thread-follower-type-and-submit-message-request`},G$=class{';
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
  'case`thread-follower-set-queued-follow-ups-state-response`:this.handleThreadFollowerSetQueuedFollowUpsStateResponse(e,t);break;case`thread-follower-open-side-chat-response`:case`thread-follower-append-queued-follow-up-response`:case`thread-follower-read-composer-draft-response`:case`thread-follower-set-composer-draft-response`:case`thread-follower-type-and-submit-message-response`:this.handleCodexLinuxFarfieldResponse(e,t);break;case`thread-role-response`:';
const MAIN_RESPONSE_NEEDLE = 'handleThreadRoleResponse(e,t){';
const MAIN_RESPONSE_REPLACEMENT =
  'handleCodexLinuxFarfieldResponse(e,t){let n=String(t.requestId),r=this.pendingCodexLinuxFarfieldRequests.get(n);if(!r||r.originId!==e.id)return;if(this.pendingCodexLinuxFarfieldRequests.delete(n),clearTimeout(r.timeout),t.error){r.reject(Error(t.error));return}if(!t.result){r.reject(Error(`Missing Codex Linux Farfield response`));return}r.resolve(t.result)}handleThreadRoleResponse(e,t){';
const MAIN_REGISTRATION_NEEDLE =
  'r.add(t.addRequestHandler(`thread-follower-set-queued-follow-ups-state`,i,async t=>this.messageHandler.handleThreadFollowerSetQueuedFollowUpsStateRequest(e,t))),r.add(()=>t.dispose())';
const MAIN_REGISTRATION_REPLACEMENT =
  'r.add(t.addRequestHandler(`thread-follower-set-queued-follow-ups-state`,i,async t=>this.messageHandler.handleThreadFollowerSetQueuedFollowUpsStateRequest(e,t)));let a=async()=>this.options.windowManager.getPrimaryWindow()?.webContents.id===e.id;for(let n of[`thread-follower-open-side-chat`,`thread-follower-append-queued-follow-up`,`thread-follower-read-composer-draft`,`thread-follower-set-composer-draft`,`thread-follower-type-and-submit-message`])r.add(t.addRequestHandler(n,a,async t=>this.messageHandler.handleCodexLinuxFarfieldRequest(e,t)));r.add(t.addRequestHandler(`thread-follower-refresh-conversation`,a,async t=>{let{conversationId:n}=t.params;if(typeof n!==`string`||n.length===0)throw Error(`Refresh conversationId is required.`);let r=c.BrowserWindow.getAllWindows().filter(n=>!n.isDestroyed()&&this.options.windowManager.isAppServiceWindow(n));if(r.length===0)throw Error(`No Desktop app window is available for refresh.`);setTimeout(()=>{for(let t of r)t.isDestroyed()||t.webContents.isDestroyed()||t.webContents.reload()},0);return{conversationId:n,refreshScheduled:!0}}));r.add(()=>t.dispose())';
const MAIN_REFRESH_HANDLER_NEEDLE =
  'async t=>{if(typeof t.conversationId!==`string`||t.conversationId.length===0)throw Error(`Refresh conversationId is required.`);let n=c.BrowserWindow.getAllWindows().filter(n=>!n.isDestroyed()&&this.options.windowManager.isAppServiceWindow(n));if(n.length===0)throw Error(`No Desktop app window is available for refresh.`);setTimeout(()=>{for(let t of n)t.isDestroyed()||t.webContents.isDestroyed()||t.webContents.reload()},0);return{conversationId:t.conversationId,refreshScheduled:!0}}';
const MAIN_REFRESH_HANDLER_REPLACEMENT =
  'async t=>{let{conversationId:n}=t.params;if(typeof n!==`string`||n.length===0)throw Error(`Refresh conversationId is required.`);let r=c.BrowserWindow.getAllWindows().filter(n=>!n.isDestroyed()&&this.options.windowManager.isAppServiceWindow(n));if(r.length===0)throw Error(`No Desktop app window is available for refresh.`);setTimeout(()=>{for(let t of r)t.isDestroyed()||t.webContents.isDestroyed()||t.webContents.reload()},0);return{conversationId:n,refreshScheduled:!0}}';

const VERSION_NEEDLE =
  '"thread-follower-set-queued-follow-ups-state":1,"thread-queued-followups-changed":1';
const VERSION_REPLACEMENT =
  '"thread-follower-set-queued-follow-ups-state":1,"thread-follower-open-side-chat":1,"thread-follower-append-queued-follow-up":1,"thread-follower-read-composer-draft":1,"thread-follower-set-composer-draft":1,"thread-follower-type-and-submit-message":1,"thread-follower-refresh-conversation":1,"thread-composer-draft-changed":1,"thread-queued-followups-changed":1';

const DISPATCHER_NEEDLE =
  'case`thread-follower-set-queued-follow-ups-state-request`:try{let{conversationId:t,state:n}=e.params;await Oc(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t}),await mu(r,x.QUEUED_FOLLOW_UPS,n),um.dispatchMessage(`thread-queued-followups-changed`,{conversationId:t,messages:n[t]??[]}),um.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,result:{ok:!0}})}catch(t){let n=t;um.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-role-request`:';
const DISPATCHER_REPLACEMENT =
  'case`thread-follower-set-queued-follow-ups-state-request`:try{let{conversationId:t,state:n}=e.params;await Oc(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t}),await mu(r,x.QUEUED_FOLLOW_UPS,n),um.dispatchMessage(`thread-queued-followups-changed`,{conversationId:t,messages:n[t]??[]}),um.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,result:{ok:!0}})}catch(t){let n=t;um.dispatchMessage(`thread-follower-set-queued-follow-ups-state-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-open-side-chat-request`:try{let{conversationId:t}=e.params;await Oc(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t});let n=globalThis.codexLinuxFarfieldSideChatHandlers?.get(t);if(n==null)throw Error(`Side task is unavailable for this conversation.`);let r=await n();if(r==null)throw Error(`Side task could not be opened.`);um.dispatchMessage(`thread-follower-open-side-chat-response`,{requestId:e.requestId,result:{conversationId:r}})}catch(t){let n=t;um.dispatchMessage(`thread-follower-open-side-chat-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-append-queued-follow-up-request`:try{let{conversationId:t,message:n}=e.params;await Oc(`assert-thread-follower-owner-for-host`,{hostId:e.hostId,conversationId:t});let r=globalThis.codexLinuxFarfieldAppendQueuedFollowUp;if(r==null)throw Error(`Native queued follow-ups are unavailable.`);let i=await r(t,n);um.dispatchMessage(`thread-follower-append-queued-follow-up-response`,{requestId:e.requestId,result:i})}catch(t){let n=t;um.dispatchMessage(`thread-follower-append-queued-follow-up-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-read-composer-draft-request`:try{let{conversationId:t}=e.params,n=globalThis.codexLinuxFarfieldReadDraft;if(n==null)throw Error(`Shared composer drafts are unavailable.`);um.dispatchMessage(`thread-follower-read-composer-draft-response`,{requestId:e.requestId,result:{draft:n(t)}})}catch(t){let n=t;um.dispatchMessage(`thread-follower-read-composer-draft-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-set-composer-draft-request`:try{let{conversationId:t,draft:n}=e.params,r=globalThis.codexLinuxFarfieldSetDraft;if(r==null)throw Error(`Shared composer drafts are unavailable.`);um.dispatchMessage(`thread-follower-set-composer-draft-response`,{requestId:e.requestId,result:{draft:r(t,n)}})}catch(t){let n=t;um.dispatchMessage(`thread-follower-set-composer-draft-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-type-and-submit-message-request`:try{let{conversationId:t,text:n}=e.params;if(typeof t!==`string`||t.length===0)throw Error(`Takeover conversationId is required.`);if(typeof n!==`string`||n.trim().length===0)throw Error(`Takeover message text is required.`);um.dispatchHostMessage({type:`navigate-to-route`,path:`/local/${encodeURIComponent(t)}`,state:{focusComposerNonce:Date.now()}});let r=Date.now()+1e4,i=null;for(;Date.now()<r;){if(i=globalThis.codexLinuxFarfieldTakeoverSubmitHandlers?.get(t),i!=null)break;await new Promise(e=>setTimeout(e,50))}if(i==null)throw Error(`Native composer did not become ready for this conversation.`);await i(n),um.dispatchMessage(`thread-follower-type-and-submit-message-response`,{requestId:e.requestId,result:{conversationId:t,submitted:!0}})}catch(t){let n=t;um.dispatchMessage(`thread-follower-type-and-submit-message-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-role-request`:';

const QUEUE_NEEDLE =
  'function fhe(){let e=q(J),t=Eh(),{data:n}=Nu(x.QUEUED_FOLLOW_UPS)';
const QUEUE_REPLACEMENT =
  'function fhe(){let e=q(J),t=Eh(),{data:n}=Nu(x.QUEUED_FOLLOW_UPS),codexLinuxFarfieldQueueRegistration=(0,t4.useEffect)(()=>{let t=async(t,n)=>{let r=i.current,a=r[t]??[],o=a.some(e=>e.id===n.id)?a:[...a,n],s={...r,[t]:o};return i.current=s,await mu(e,x.QUEUED_FOLLOW_UPS,s),e.get(Ti,t)?.role===`owner`&&um.dispatchMessage(`thread-queued-followups-changed`,{conversationId:t,messages:o}),{messages:o}};return globalThis.codexLinuxFarfieldAppendQueuedFollowUp=t,()=>{globalThis.codexLinuxFarfieldAppendQueuedFollowUp===t&&delete globalThis.codexLinuxFarfieldAppendQueuedFollowUp}},[e])';

const COMPOSER_REGISTRATION_NEEDLE =
  ',{onOpen:Fs,onOpenQuickChat:Is,onOpenSideChat:Ls}=gq({scope:B,conversationId:K,';
const COMPOSER_REGISTRATION_REPLACEMENT =
  ',codexLinuxFarfieldComposerRegistration=(0,wq.useEffect)(()=>{if(K==null)return;let e=()=>Ps(null);return globalThis.codexLinuxFarfieldRegisterComposer(K,In,e)},[K,In,Ps]),{onOpen:Fs,onOpenQuickChat:Is,onOpenSideChat:Ls}=gq({scope:B,conversationId:K,';
const COMPOSER_INPUT_NEEDLE = 'onUserInput:()=>{Hi(B)}';
const COMPOSER_INPUT_REPLACEMENT =
  'onUserInput:()=>{Hi(B),K!=null&&globalThis.codexLinuxFarfieldPublishLocalDraft?.(K,In.getPersistedText())}';
const COMPOSER_SUBMIT_REGISTRATION_NEEDLE =
  '(0,wq.useEffect)(()=>{},[null,In])';
const COMPOSER_SUBMIT_REGISTRATION_REPLACEMENT =
  'let codexLinuxFarfieldTakeoverSubmitRegistration=(0,wq.useEffect)(()=>{if(K==null||Us.type!==`local`||fs!=null&&fs!==`empty-message`)return;let e=async e=>{In.setText(e);let t=null;await Ys({promptRawOverride:e,persistedPromptRawOverride:e,focusComposerAfterSubmit:!0,onLocalTurnStarted:e=>{t=e},onQueuedFollowUp:e=>{t={threadId:K,queuedFollowUpId:e}}});if(t==null)throw Error(`Native composer did not accept the takeover message.`);return t};return globalThis.codexLinuxFarfieldRegisterTakeoverSubmit(K,e)},[K,In,Ys,Us.type,fs])';
const COMPOSER_TURN_STARTED_NEEDLE =
  'onLocalTurnStarted:e=>{xn!=null&&e.threadId!=null&&e.turnId!=null&&HS(B,xn.itemId,e.threadId,e.turnId)},openSideChatFromComposer:Ps';
const COMPOSER_TURN_STARTED_REPLACEMENT =
  'onLocalTurnStarted:t=>{xn!=null&&t.threadId!=null&&t.turnId!=null&&HS(B,xn.itemId,t.threadId,t.turnId),e.onLocalTurnStarted?.(t)},openSideChatFromComposer:Ps';
const COMPOSER_QUEUED_FOLLOW_UP_NEEDLE =
  'if(J){vC(A,{result:Ni.CODEX_REMOTE_SSH_MESSAGE_RESULT_QUEUED,submitAction:X}),u(k.enqueue({text:q,context:oe,cwd:M})?.id??null),n(),N(!1),U&&c();return}';
const COMPOSER_QUEUED_FOLLOW_UP_REPLACEMENT =
  'if(J){vC(A,{result:Ni.CODEX_REMOTE_SSH_MESSAGE_RESULT_QUEUED,submitAction:X});let e=k.enqueue({text:q,context:oe,cwd:M})?.id??null;u(e),e!=null&&T.onQueuedFollowUp?.(e),n(),N(!1),U&&c();return}';

const COMPOSER_BOOTSTRAP = String.raw`const codexLinuxFarfieldComposer=!0;(()=>{if(globalThis.codexLinuxFarfieldDraftBridgeInitialized)return;globalThis.codexLinuxFarfieldDraftBridgeInitialized=!0;let e="codex-linux-farfield-composer-drafts-v1",t=new Map,r="desktop:"+crypto.randomUUID(),i=()=>{let t=localStorage.getItem(e);if(t==null)return{};try{let e=JSON.parse(t);return e&&typeof e==="object"&&!Array.isArray(e)?e:{}}catch(e){return console.error("[Farfield draft bridge] Could not parse persisted drafts",e),{}}},a=i(),o=()=>{localStorage.setItem(e,JSON.stringify(a))},s=e=>{let t=a[e];return t&&typeof t.text==="string"&&Number.isSafeInteger(t.revision)&&t.revision>=0&&typeof t.source==="string"&&t.source.length>0?t:{text:"",revision:0,source:"desktop"}},c=(e,t)=>{if(typeof e!=="string"||e.length===0)throw Error("Draft conversationId is required.");if(t==null||typeof t!=="object"||typeof t.text!=="string"||!Number.isSafeInteger(t.revision)||t.revision<0||typeof t.source!=="string"||t.source.length===0)throw Error("Invalid shared composer draft.");let n=s(e);if(t.revision!==n.revision)return n;if(t.text===n.text)return n;let r={text:t.text,revision:n.revision+1,source:t.source};a={...a,[e]:r},o();let i=globalThis.codexLinuxFarfieldDraftControllers?.get(e);i!=null&&i.getPersistedText()!==r.text&&i.setText(r.text),$u.dispatchMessage("thread-composer-draft-changed",{conversationId:e,draft:r});return r};globalThis.codexLinuxFarfieldDraftControllers??=new Map,globalThis.codexLinuxFarfieldSideChatHandlers??=new Map,globalThis.codexLinuxFarfieldTakeoverSubmitHandlers??=new Map,globalThis.codexLinuxFarfieldRefreshHandlers??=new Map,globalThis.codexLinuxFarfieldReadDraft=s,globalThis.codexLinuxFarfieldSetDraft=c,globalThis.codexLinuxFarfieldRegisterComposer=(e,t,n)=>{let r=()=>location.reload();globalThis.codexLinuxFarfieldDraftControllers.set(e,t),globalThis.codexLinuxFarfieldSideChatHandlers.set(e,n),globalThis.codexLinuxFarfieldRefreshHandlers.set(e,r);let i=s(e),a=t.getPersistedText();return i.revision===0&&a.length>0?c(e,{text:a,revision:0,source:"desktop"}):a!==i.text&&t.setText(i.text),()=>{globalThis.codexLinuxFarfieldDraftControllers.get(e)===t&&globalThis.codexLinuxFarfieldDraftControllers.delete(e),globalThis.codexLinuxFarfieldSideChatHandlers.get(e)===n&&globalThis.codexLinuxFarfieldSideChatHandlers.delete(e),globalThis.codexLinuxFarfieldRefreshHandlers.get(e)===r&&globalThis.codexLinuxFarfieldRefreshHandlers.delete(e)}};globalThis.codexLinuxFarfieldRegisterTakeoverSubmit=(e,t)=>(globalThis.codexLinuxFarfieldTakeoverSubmitHandlers.set(e,t),()=>{globalThis.codexLinuxFarfieldTakeoverSubmitHandlers.get(e)===t&&globalThis.codexLinuxFarfieldTakeoverSubmitHandlers.delete(e)}),globalThis.codexLinuxFarfieldPublishLocalDraft=(e,i)=>{let a=t.get(e);a!=null&&clearTimeout(a),t.set(e,setTimeout(()=>{t.delete(e);try{let t=s(e);c(e,{text:i,revision:t.revision,source:r})}catch(e){console.error("[Farfield draft bridge] Could not publish native draft",e)}},250))}})();`;

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
    return source.includes(MAIN_REFRESH_HANDLER_NEEDLE)
      ? source.replace(MAIN_REFRESH_HANDLER_NEEDLE, MAIN_REFRESH_HANDLER_REPLACEMENT)
      : source;
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

function applyFarfieldBridgePatch(source) {
  if (source.includes(BRIDGE_MARKER)) return source;
  if (!source.includes(DISPATCHER_NEEDLE) || !source.includes(QUEUE_NEEDLE)) {
    warn("Could not find the current follower dispatcher and native queue hook");
    return source;
  }

  let patched = source.replace(DISPATCHER_NEEDLE, DISPATCHER_REPLACEMENT);
  patched = patched.replace(QUEUE_NEEDLE, QUEUE_REPLACEMENT);
  return `const ${BRIDGE_MARKER}=!0;${patched}`;
}

function applyFarfieldComposerPatch(source) {
  if (source.includes(COMPOSER_MARKER)) return source;
  if (
    !source.includes(COMPOSER_REGISTRATION_NEEDLE) ||
    !source.includes(COMPOSER_INPUT_NEEDLE) ||
    !source.includes(COMPOSER_SUBMIT_REGISTRATION_NEEDLE) ||
    !source.includes(COMPOSER_TURN_STARTED_NEEDLE) ||
    !source.includes(COMPOSER_QUEUED_FOLLOW_UP_NEEDLE)
  ) {
    warn("Could not find the current native composer registration and input hooks");
    return source;
  }

  let patched = source.replace(
    COMPOSER_REGISTRATION_NEEDLE,
    COMPOSER_REGISTRATION_REPLACEMENT,
  );
  patched = patched.replace(COMPOSER_INPUT_NEEDLE, COMPOSER_INPUT_REPLACEMENT);
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
  applyFarfieldBridgePatch,
  applyFarfieldComposerPatch,
  applyFarfieldExtractedRouterPatch,
  applyFarfieldMainProcessPatch,
  applyFarfieldProtocolPatch,
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
        /^app-initial~app-main~new-thread-panel-page~onboarding-page~appgen-library-page~hotkey-windo~d4kxte0o-[^.]+\.js$/,
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
      apply: applyFarfieldBridgePatch,
    },
    {
      id: "desktop-farfield-composer-registration",
      phase: "webview-asset",
      order: 20_761,
      ciPolicy: "optional",
      pattern:
        /^app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~iufn7mg3-[^.]+\.js$/,
      missingDescription: "current Desktop page composer bundle",
      skipDescription: "Farfield native composer hooks drifted upstream",
      apply: applyFarfieldComposerPatch,
    },
  ],
};
