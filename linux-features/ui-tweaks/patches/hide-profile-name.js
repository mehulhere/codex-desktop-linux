"use strict";

const PROFILE_FOOTER_ASSET_PATTERN = /^app-initial~app-main~page-[^.]+\.js$/;
const PROFILE_FOOTER_MARKER = "codex.profileFooter.openProfileMenu";
const PROFILE_FOOTER_CHILDREN_PATTERN =
  /(\(`div`,\{)(children:\[)([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)(\]\}\))/;
const CURRENT_PROFILE_FOOTER_CHILDREN_PATTERN =
  /(\(0,[A-Za-z_$][\w$]*\.jsxs\)\(`div`,\{)([^{}]{0,600}?)(children:\[)([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)(\]\}\))/;

function hideProfileNameEnabled(context) {
  const defaults = context?.feature?.manifest?.tweaks?.sidebar?.hideProfileName;
  const settings = context?.feature?.settings?.tweaks?.sidebar?.hideProfileName;
  return (settings?.enabled ?? defaults?.enabled) !== false;
}

function applyHideProfileNamePatch(source, context = {}) {
  if (typeof source !== "string" || !hideProfileNameEnabled(context)) {
    return source;
  }
  const markerIndex = source.indexOf(PROFILE_FOOTER_MARKER);
  if (markerIndex < 0) {
    return source;
  }
  const componentStart = source.lastIndexOf("function ", markerIndex);
  if (componentStart >= 0) {
    const searchEnd = Math.min(source.length, markerIndex + 8_000);
    const componentSource = source.slice(componentStart, searchEnd);
    const patchedComponent = componentSource.replace(
      PROFILE_FOOTER_CHILDREN_PATTERN,
      '$1"data-codex-linux-sidebar-footer":"",$2$4$5',
    );
    if (patchedComponent !== componentSource) {
      return `${source.slice(0, componentStart)}${patchedComponent}${source.slice(searchEnd)}`;
    }
  }

  // Current bundles compile the footer as a memoized jsxs(div) expression
  // rather than a named function. The outer footer div contains the profile
  // control first and Help second; keep Help, remove the profile control, and
  // add the stable mount anchor for the aggregate quota row.
  const currentSearchStart = markerIndex;
  const currentSearchEnd = Math.min(source.length, markerIndex + 5_000);
  const currentSource = source.slice(currentSearchStart, currentSearchEnd);
  const patchedCurrentSource = currentSource.replace(
    CURRENT_PROFILE_FOOTER_CHILDREN_PATTERN,
    '$1"data-codex-linux-sidebar-footer":"",$2$3$5$6',
  );
  if (patchedCurrentSource === currentSource) {
    return source;
  }
  return `${source.slice(0, currentSearchStart)}${patchedCurrentSource}${source.slice(currentSearchEnd)}`;
}

const descriptors = [
  {
    id: "hide-profile-name",
    phase: "webview-asset",
    order: 20_795,
    ciPolicy: "optional",
    pattern: PROFILE_FOOTER_ASSET_PATTERN,
    missingDescription: "sidebar profile footer bundle",
    skipDescription: "ui-tweaks hide profile name patch",
    apply: applyHideProfileNamePatch,
  },
];

module.exports = {
  PROFILE_FOOTER_ASSET_PATTERN,
  applyHideProfileNamePatch,
  descriptors,
};
