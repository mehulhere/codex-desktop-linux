"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  applyMainProcessPatch,
  applyPreloadPatch,
} = require("./main-process.js");
const { applyStatusDialogPatch } = require("./webview.js");

function applyPreloadExtractedAppPatch(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    return { matched: false, changed: 0, reason: "Vite build directory not found" };
  }
  const preloadPath = path.join(buildDir, "preload.js");
  if (!fs.existsSync(preloadPath)) {
    return { matched: false, changed: 0, reason: "preload bundle not found" };
  }
  const source = fs.readFileSync(preloadPath, "utf8");
  const patched = applyPreloadPatch(source);
  if (patched === source) {
    return source.includes("getMultiAuthThreadStatus")
      ? { matched: true, changed: 0 }
      : { matched: false, changed: 0, reason: "preload bridge insertion point not found" };
  }
  fs.writeFileSync(preloadPath, patched, "utf8");
  return { matched: true, changed: 1 };
}

module.exports = {
  applyPreloadExtractedAppPatch,
  descriptors: [
    {
      id: "main-process",
      phase: "main-bundle",
      order: 20_700,
      ciPolicy: "optional",
      apply: applyMainProcessPatch,
    },
    {
      id: "preload-bridge",
      phase: "extracted-app:post-webview",
      order: 20_710,
      ciPolicy: "optional",
      apply: applyPreloadExtractedAppPatch,
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
      id: "status-dialog",
      phase: "webview-asset",
      order: 20_720,
      ciPolicy: "optional",
      pattern: /^(?:composer-|app-initial~app-main~page-).*\.js$/,
      missingDescription: "status dialog bundle",
      skipDescription: "multi-auth status account row patch",
      apply: applyStatusDialogPatch,
    },
  ],
};
