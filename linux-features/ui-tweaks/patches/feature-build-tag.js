"use strict";

const BUILD_TAG_ASSET_PATTERN = /^index-.*\.js$/;
const BUILD_TAG_RUNTIME_MARKER = "codexLinuxFeatureBuildTagRuntimeV1";
const BUILD_TAG_ELEMENT_ID = "codex-linux-feature-build-tag";

function featureBuildTagRuntimeSource() {
  return [
    `;(()=>{`,
    `if(globalThis.${BUILD_TAG_RUNTIME_MARKER})return;`,
    `globalThis.${BUILD_TAG_RUNTIME_MARKER}=true;`,
    `const ELEMENT_ID=${JSON.stringify(BUILD_TAG_ELEMENT_ID)};`,
    `let sequence=0,pending=new Map;`,
    `function onMessage(event){let payload=event?.data;if(!payload||typeof payload!=="object"||payload.type!=="fetch-response")return;let request=pending.get(payload.requestId);if(!request)return;pending.delete(payload.requestId);if(payload.responseType==="success"){let body=null;try{body=payload.bodyJsonString?JSON.parse(payload.bodyJsonString):null}catch{}request.resolve(body)}else request.reject(Error(payload.error||"request failed"))}`, 
    `window.addEventListener("message",onMessage);`,
    `function dispatch(payload){let bridge=window.electronBridge,event=new CustomEvent("codex-message-from-view",{detail:payload});if(bridge?.sendMessageFromView){event.__codexForwardedViaBridge=true;bridge.sendMessageFromView(payload).catch(()=>{})}window.dispatchEvent(event)}`,
    `function post(method,timeoutMs=4000){let requestId="codex-linux-feature-build-tag-"+(++sequence),payload={type:"fetch",hostId:"local",requestId,method:"POST",url:"vscode://codex/"+method,body:"{}"};return new Promise((resolve,reject)=>{let timer=setTimeout(()=>{pending.delete(requestId);reject(Error("timeout"))},timeoutMs);pending.set(requestId,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});dispatch(payload)})}`,
    `function ensureBadge(){let badge=document.getElementById(ELEMENT_ID);if(badge)return badge;badge=document.createElement("button");badge.id=ELEMENT_ID;badge.type="button";badge.textContent="FEATURE BUILD · unknown";badge.setAttribute("aria-label","Linux feature build unknown");badge.title="Show Linux build information";Object.assign(badge.style,{position:"fixed",top:"7px",left:"50%",transform:"translateX(-50%)",zIndex:"2147483000",height:"24px",padding:"0 12px",border:"1px solid #ef5350",borderRadius:"999px",background:"#c62828",color:"#fff",font:"700 11px/1 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif",letterSpacing:".04em",whiteSpace:"nowrap",cursor:"pointer",pointerEvents:"auto",WebkitAppRegion:"no-drag",boxShadow:"0 2px 8px rgba(0,0,0,.25)"});badge.addEventListener("click",()=>{post("codex-linux-show-build-info").catch(error=>console.warn("WARN: Could not open Linux build information: "+(error?.message||error)))});(document.body||document.documentElement).appendChild(badge);return badge}`,
    `async function load(){let badge=ensureBadge();try{let payload=await post("codex-linux-get-build-info"),source=payload?.info?.source||{},commit=typeof source.commit==="string"&&source.commit.trim()?source.commit.trim():typeof source.shortCommit==="string"?source.shortCommit.trim():"";if(!commit){console.warn("WARN: Linux build metadata did not contain a source commit; showing unknown build revision");return}let shortCommit=commit.slice(0,7);badge.textContent="FEATURE BUILD · "+shortCommit;badge.setAttribute("aria-label","Linux feature build "+shortCommit);badge.title="Show build information for commit "+commit}catch(error){console.warn("WARN: Linux feature build metadata request failed; showing unknown build revision: "+(error?.message||error))}}`,
    `function start(){if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",start,{once:true});return}ensureBadge();load()}`, 
    `start();`,
    `})();`,
  ].join("");
}

function applyFeatureBuildTagPatch(source) {
  if (typeof source !== "string" || source.includes(BUILD_TAG_RUNTIME_MARKER)) {
    return source;
  }
  const runtime = featureBuildTagRuntimeSource();
  return source.endsWith("\n") ? source + runtime : `${source}\n${runtime}`;
}

function featureBuildTagEnabled(context = {}) {
  const defaults = context?.feature?.manifest?.tweaks?.buildTag;
  const settings = context?.feature?.settings?.tweaks?.buildTag;
  return (settings?.enabled ?? defaults?.enabled) !== false;
}

const descriptors = [
  {
    id: "feature-build-tag",
    phase: "webview-asset",
    order: 20_789,
    ciPolicy: "optional",
    pattern: BUILD_TAG_ASSET_PATTERN,
    missingDescription: "webview index bundle",
    skipDescription: "ui-tweaks feature build tag",
    apply: (source, context = {}) =>
      featureBuildTagEnabled(context) ? applyFeatureBuildTagPatch(source) : source,
  },
];

module.exports = {
  BUILD_TAG_ASSET_PATTERN,
  BUILD_TAG_ELEMENT_ID,
  BUILD_TAG_RUNTIME_MARKER,
  applyFeatureBuildTagPatch,
  featureBuildTagEnabled,
  featureBuildTagRuntimeSource,
  descriptors,
};
