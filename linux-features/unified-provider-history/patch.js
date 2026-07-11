"use strict";

const PROVIDER_FILTER = "modelProviders:null";
const REQUEST_CONTEXT_RADIUS = 400;
const DIRECT_METHOD_RADIUS = 160;

function nearestProtocolMethodBefore(source, index) {
  const start = Math.max(0, index - REQUEST_CONTEXT_RADIUS);
  const before = source.slice(start, index);
  const methodPattern = /`([a-z][a-z0-9-]*\/[a-z][a-z0-9\/-]*)`/gi;
  let nearest = null;
  let match;
  while ((match = methodPattern.exec(before)) != null) {
    nearest = {
      method: match[1],
      distance: before.length - (match.index + match[0].length),
    };
  }
  return nearest;
}

function belongsToThreadList(source, index) {
  const before = source.slice(Math.max(0, index - REQUEST_CONTEXT_RADIUS), index);
  const after = source.slice(index + PROVIDER_FILTER.length, index + REQUEST_CONTEXT_RADIUS);
  const directMethod = nearestProtocolMethodBefore(source, index);
  if (directMethod != null && directMethod.distance <= DIRECT_METHOD_RADIUS) {
    return directMethod.method === "thread/list";
  }
  return (
    after.includes("`thread/list`") ||
    before.includes("listAllThreads(")
  );
}

function applyUnifiedProviderHistoryPatch(source) {
  if (
    source.includes("codexLinuxUnifiedProviderHistory") ||
    !source.includes("thread/list") ||
    !source.includes(PROVIDER_FILTER)
  ) {
    return source;
  }

  let changed = false;
  const patched = source.replaceAll(PROVIDER_FILTER, (match, index) => {
    if (!belongsToThreadList(source, index)) return match;
    changed = true;
    return "modelProviders:[]";
  });
  return changed ? `const codexLinuxUnifiedProviderHistory=!0;${patched}` : source;
}

module.exports = {
  applyUnifiedProviderHistoryPatch,
  descriptors: [
    {
      id: "thread-list-all-providers",
      phase: "webview-asset",
      order: 20_730,
      ciPolicy: "optional",
      pattern: /^app-initial~app-main~.*\.js$/,
      missingDescription: "app thread-list bundle",
      skipDescription: "unified model-provider history patch",
      apply: applyUnifiedProviderHistoryPatch,
    },
  ],
};
