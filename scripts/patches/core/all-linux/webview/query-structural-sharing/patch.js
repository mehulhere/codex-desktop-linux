"use strict";

const { webviewAssetPatch } = require("../../../../descriptor.js");
const {
  applyLinuxQueryStructuralSharingGuardPatch,
} = require("../../../../impl/webview/index.js");

module.exports = [
  webviewAssetPatch({
    id: "linux-query-structural-sharing-guard",
    phase: "webview-asset",
    order: 1045,
    ciPolicy: "required-upstream",
    pattern: /^app-initial~app-main~.*composer-utility-bar.*\.js$/,
    missingDescription: "composer utility query bundle",
    skipDescription: "query structural sharing guard",
    apply: applyLinuxQueryStructuralSharingGuardPatch,
  }),
];
