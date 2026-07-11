"use strict";

const RUNTIME_PROVIDER = "codex-multi-auth-runtime-proxy";

function applyMultiAuthThreadRoutingPatch(source) {
  let patched = source.replace(
    /modelProvider:([A-Za-z_$][\w$]*)\.modelProvider,serviceTier:\1\.serviceTier/g,
    `modelProvider:$1.modelProvider??\`${RUNTIME_PROVIDER}\`,serviceTier:$1.serviceTier`,
  );
  patched = patched.replace(
    /sendRequest\(`thread\/fork`,\{threadId:([A-Za-z_$][\w$]*),path:/g,
    `sendRequest(\`thread/fork\`,{threadId:$1,modelProvider:\`${RUNTIME_PROVIDER}\`,path:`,
  );
  return patched;
}

module.exports = { applyMultiAuthThreadRoutingPatch };
