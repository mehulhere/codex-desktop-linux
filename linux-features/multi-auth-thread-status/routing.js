"use strict";

// The app bind keeps the native OpenAI provider and points its base URL at the
// loopback router. Resumed/forked tasks must use that same provider so Desktop
// retains its first-party tool and skill registry (image generation, browser,
// dictation, and bundled plugins). Selecting the legacy custom provider here
// makes the model request route, but drops those host-side capabilities.
const NATIVE_PROVIDER = "openai";
const NATIVE_CAPABILITY_ERROR =
  "Codex stopped: native Desktop tools and skills are unavailable. The task was stopped to avoid spending tokens without ImageGen, browser, dictation, and bundled skills.";

function nativeCapabilityGuard(variable) {
  return `if(!Array.isArray(${variable}.dynamicTools)||${variable}.dynamicTools.length===0)throw Error(\`${NATIVE_CAPABILITY_ERROR}\`);`;
}

function applyMultiAuthThreadRoutingPatch(source) {
  let patched = source.replace(
    /modelProvider:([A-Za-z_$][\w$]*)\.modelProvider,serviceTier:\1\.serviceTier/g,
    `modelProvider:\`${NATIVE_PROVIDER}\`,serviceTier:$1.serviceTier`,
  );
  patched = patched.replace(
    /modelProvider:([A-Za-z_$][\w$]*)\.modelProvider\?\?\`codex-multi-auth-runtime-proxy\`,serviceTier:\1\.serviceTier/g,
    `modelProvider:\`${NATIVE_PROVIDER}\`,serviceTier:$1.serviceTier`,
  );
  patched = patched.replace(
    /sendRequest\(`thread\/fork`,\{threadId:([A-Za-z_$][\w$]*),path:/g,
    `sendRequest(\`thread/fork\`,{threadId:$1,modelProvider:\`${NATIVE_PROVIDER}\`,path:`,
  );
  patched = patched.replace(
    /sendRequest\(`thread\/fork`,\{threadId:([A-Za-z_$][\w$]*),modelProvider:\`codex-multi-auth-runtime-proxy\`,path:/g,
    `sendRequest(\`thread/fork\`,{threadId:$1,modelProvider:\`${NATIVE_PROVIDER}\`,path:`,
  );
  // Resuming a task with skipDynamicTools drops Desktop's native registry.
  // Always rehydrate it, then fail before the request if the registry is empty.
  patched = patched.replace(
    /skipDynamicTools:!0,threadId:/g,
    "skipDynamicTools:!1,threadId:",
  );
  patched = patched.replace(
    /P=await e\.buildNewConversationParams\(([\s\S]*?)\),F=e\.sendRequest\(`thread\/resume`/g,
    (_match, args) =>
      `P=await e.buildNewConversationParams(${args});${nativeCapabilityGuard("P")}F=e.sendRequest(\`thread/resume\``,
  );
  patched = patched.replace(
    /b=await this\.buildNewConversationParams\(([\s\S]*?)\);f!=null/g,
    (_match, args) =>
      `b=await this.buildNewConversationParams(${args});${nativeCapabilityGuard("b")}f!=null`,
  );
  return patched;
}

module.exports = { applyMultiAuthThreadRoutingPatch, NATIVE_CAPABILITY_ERROR };
