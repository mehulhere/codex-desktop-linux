"use strict";

const { patchProjectlessDocumentsAssets } = require("../../../../projectless-documents.js");

module.exports = {
  id: "linux-projectless-xdg-documents-dir",
  phase: "extracted-app",
  order: 245,
  ciPolicy: "optional",
  apply: patchProjectlessDocumentsAssets,
  status: (result, warnings) => ({
    status: result?.changed
      ? "applied"
      : result?.matched
        ? "already-applied"
        : "skipped-optional",
    reason: result?.reason ?? warnings[0] ?? null,
  }),
};
