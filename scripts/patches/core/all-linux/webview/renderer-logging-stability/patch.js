"use strict";

const { webviewAssetPatch } = require("../../../../descriptor.js");
const {
  applyLinuxRendererLoggingGuardPatch,
} = require("../../../../impl/webview/index.js");

module.exports = [
  webviewAssetPatch({
    id: "linux-renderer-logging-stability",
    phase: "webview-asset",
    order: 1046,
    ciPolicy: "required-upstream",
    pattern: /^app-initial~app-main~.*composer-utility-bar.*\.js$/,
    missingDescription: "renderer logging bridge bundle",
    skipDescription: "renderer logging stability guard",
    apply: applyLinuxRendererLoggingGuardPatch,
  }),
];
