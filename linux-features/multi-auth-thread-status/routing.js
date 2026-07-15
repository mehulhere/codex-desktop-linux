"use strict";

// The app bind keeps the native OpenAI provider and points its base URL at the
// loopback router. Resumed/forked tasks must use that same provider so Desktop
// retains its first-party tool and skill registry (image generation, browser,
// dictation, and bundled plugins). Selecting the legacy custom provider here
// makes the model request route, but drops those host-side capabilities.
const NATIVE_PROVIDER = "openai";

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
  return patched;
}

module.exports = { applyMultiAuthThreadRoutingPatch };
