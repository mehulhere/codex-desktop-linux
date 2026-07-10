"use strict";

const { findMatchingBrace } = require("../../scripts/patches/lib/minified-js.js");

function applyStatusDialogPatch(source) {
  if (source.includes("codexLinuxMultiAuthThreadStatus")) return source;
  const header = source.match(
    /function ([A-Za-z_$][\w$]*)\(e\)\{let ([A-Za-z_$][\w$]*)=\(0,([A-Za-z_$][\w$]*)\.c\)\(22\),\{threadId:([A-Za-z_$][\w$]*),contextUsage:([A-Za-z_$][\w$]*),rateLimitRows:([A-Za-z_$][\w$]*),alertData:([A-Za-z_$][\w$]*),onClose:([A-Za-z_$][\w$]*)\}=e/,
  );
  if (header == null || header.index == null) {
    console.warn("WARN: Could not find current status dialog for multi-auth account row");
    return source;
  }
  const openBrace = source.indexOf("{", header.index);
  const closeBrace = findMatchingBrace(source, openBrace);
  if (closeBrace === -1) return source;
  const threadVar = header[4];
  let block = source.slice(header.index, closeBrace + 1);
  const hooks = block.match(
    /\[([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\]=\(0,([A-Za-z_$][\w$]*)\.useState\)\(!1\),([A-Za-z_$][\w$]*)=\(0,\3\.useRef\)\(null\),([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*);/,
  );
  if (hooks == null) {
    console.warn("WARN: Could not find current status dialog hooks for multi-auth account row");
    return source;
  }
  const originalHooks = hooks[0];
  const reactVar = hooks[3];
  const injectedHooks = `${originalHooks}let[codexLinuxMultiAuthThreadStatus,codexLinuxSetMultiAuthThreadStatus]=(0,${reactVar}.useState)(null);(0,${reactVar}.useEffect)(()=>{let e=!1;return ${threadVar}&&window.electronBridge?.getMultiAuthThreadStatus?.(${threadVar}).then(t=>{e||codexLinuxSetMultiAuthThreadStatus(t??null)}).catch(()=>{e||codexLinuxSetMultiAuthThreadStatus(null)}),()=>{e=!0}},[${threadVar}]);`;
  block = block.replace(originalHooks, injectedHooks);
  const contextNeedle = /,([A-Za-z_$][\w$]*)&&([A-Za-z_$][\w$]*)!=null\)\{/;
  const contextMatch = block.match(contextNeedle);
  if (contextMatch == null) {
    console.warn("WARN: Could not find status context row insertion point for multi-auth account row");
    return source;
  }
  block = block.replace(
    contextMatch[0],
    `,d(\`Account:\`,codexLinuxMultiAuthThreadStatus?.accountDisplay??\`Not assigned yet\`)${contextMatch[0]}`,
  );
  return source.slice(0, header.index) + block + source.slice(closeBrace + 1);
}

module.exports = { applyStatusDialogPatch };
