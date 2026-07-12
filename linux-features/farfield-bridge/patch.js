"use strict";

const BRIDGE_MARKER = "codexLinuxFarfieldBridge";
const COMPOSER_MARKER = "codexLinuxFarfieldComposer";
const PROTOCOL_MARKER = "codexLinuxFarfieldProtocol";
const VERSION_NEEDLE = '"thread-follower-compact-thread":1,"thread-follower-steer-turn":1';
const VERSION_REPLACEMENT = '"thread-follower-compact-thread":1,"thread-follower-open-side-chat":1,"thread-follower-steer-turn":1';
const DISPATCHER_NEEDLE = 'case`thread-follower-compact-thread-request`:try{let t=await ql(`thread-follower-compact-thread-for-host`,{hostId:e.hostId,...e.params});wl.dispatchMessage(`thread-follower-compact-thread-response`,{requestId:e.requestId,result:t})}catch(t){let n=t;wl.dispatchMessage(`thread-follower-compact-thread-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-steer-turn-request`:';
const DISPATCHER_REPLACEMENT = 'case`thread-follower-compact-thread-request`:try{let t=await ql(`thread-follower-compact-thread-for-host`,{hostId:e.hostId,...e.params});wl.dispatchMessage(`thread-follower-compact-thread-response`,{requestId:e.requestId,result:t})}catch(t){let n=t;wl.dispatchMessage(`thread-follower-compact-thread-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-open-side-chat-request`:try{let t=await ql(`thread-follower-open-side-chat-for-host`,{hostId:e.hostId,...e.params});wl.dispatchMessage(`thread-follower-open-side-chat-response`,{requestId:e.requestId,result:t})}catch(t){let n=t;wl.dispatchMessage(`thread-follower-open-side-chat-response`,{requestId:e.requestId,error:String(n)})}break bb38;case`thread-follower-steer-turn-request`:';
const OWNER_NEEDLE = '"thread-follower-compact-thread-for-host":r9(async(e,t)=>(e.assertThreadFollowerOwner(t.conversationId),await e.compactThread(t.conversationId),{ok:!0})),"thread-follower-edit-last-user-turn-for-host"';
const OWNER_REPLACEMENT = '"thread-follower-compact-thread-for-host":r9(async(e,t)=>(e.assertThreadFollowerOwner(t.conversationId),await e.compactThread(t.conversationId),{ok:!0})),"thread-follower-open-side-chat-for-host":r9(async(e,t)=>{e.assertThreadFollowerOwner(t.conversationId);let n=globalThis.codexLinuxFarfieldSideChatHandlers?.get(t.conversationId);if(n==null)throw Error(`Side task is unavailable for this conversation.`);let r=await n(null);if(r==null)throw Error(`Side task could not be opened.`);return{conversationId:r}}),"thread-follower-edit-last-user-turn-for-host"';
const COMPOSER_NEEDLE = '}),{onOpen:_o,onOpenQuickChat:vo,onOpenSideChat:yo}=UGa';
const COMPOSER_REPLACEMENT = '}),codexLinuxFarfieldSideChatRegistration=(0,Z9.useEffect)(()=>{if(z==null)return;let e=globalThis.codexLinuxFarfieldSideChatHandlers??=new Map;return e.set(z,go),()=>{e.get(z)===go&&e.delete(z)}},[z,go]),{onOpen:_o,onOpenQuickChat:vo,onOpenSideChat:yo}=UGa';

function warn(message) {
  console.warn(`WARN: ${message} - skipping Farfield side-task bridge patch`);
}

function applyFarfieldProtocolPatch(source) {
  if (source.includes(PROTOCOL_MARKER)) return source;
  if (!source.includes(VERSION_NEEDLE)) {
    warn("Could not find the current follower method version registry");
    return source;
  }
  return `const ${PROTOCOL_MARKER}=!0;${source.replace(VERSION_NEEDLE, VERSION_REPLACEMENT)}`;
}

function applyFarfieldBridgePatch(source) {
  if (source.includes(BRIDGE_MARKER)) return source;
  if (!source.includes(DISPATCHER_NEEDLE) || !source.includes(OWNER_NEEDLE)) {
    warn("Could not find the current follower dispatcher and owner handlers");
    return source;
  }

  let patched = source.replace(DISPATCHER_NEEDLE, DISPATCHER_REPLACEMENT);
  patched = patched.replace(OWNER_NEEDLE, OWNER_REPLACEMENT);
  return `const ${BRIDGE_MARKER}=!0;${patched}`;
}

function applyFarfieldComposerPatch(source) {
  if (source.includes(COMPOSER_MARKER)) return source;
  if (!source.includes(COMPOSER_NEEDLE)) {
    warn("Could not find the current empty side-task composer callback");
    return source;
  }
  return `const ${COMPOSER_MARKER}=!0;${source.replace(COMPOSER_NEEDLE, COMPOSER_REPLACEMENT)}`;
}

module.exports = {
  applyFarfieldBridgePatch,
  applyFarfieldComposerPatch,
  applyFarfieldProtocolPatch,
  descriptors: [
    {
      id: "desktop-side-task-follower-version",
      phase: "webview-asset",
      order: 20_759,
      ciPolicy: "optional",
      pattern: /^app-initial~app-main~projects-index-page~hotkey-window-thread-page~local-environments-setti~.*\.js$/,
      missingDescription: "current Desktop follower protocol bundle",
      skipDescription: "Farfield follower method version needle drifted upstream",
      apply: applyFarfieldProtocolPatch,
    },
    {
      id: "desktop-side-task-follower-request",
      phase: "webview-asset",
      order: 20_760,
      ciPolicy: "optional",
      pattern: /^app-initial~app-main~page-.*\.js$/,
      missingDescription: "current Desktop page bundle",
      skipDescription: "Farfield side-task follower handler needles drifted upstream",
      apply: applyFarfieldBridgePatch,
    },
    {
      id: "desktop-side-task-composer-registration",
      phase: "webview-asset",
      order: 20_761,
      ciPolicy: "optional",
      pattern: /^app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~.*\.js$/,
      missingDescription: "current Desktop composer bundle",
      skipDescription: "Farfield side-task composer callback needle drifted upstream",
      apply: applyFarfieldComposerPatch,
    },
  ],
};
