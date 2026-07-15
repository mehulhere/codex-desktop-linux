#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const FARFIELD_FEATURE_ID = "farfield-bridge";
const REQUIRED_PATCH_NAMES = [
  "desktop-farfield-main-process",
  "desktop-farfield-router-startup",
  "desktop-farfield-follower-versions",
  "desktop-farfield-follower-requests",
  "desktop-farfield-native-queue",
  "desktop-farfield-composer-registration",
];
const SUCCESS_STATUSES = new Set(["applied", "already-applied"]);

function verifyFarfieldPatchReport(report) {
  if (report == null || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Farfield patch report must be an object");
  }

  const enabledFeatures = Array.isArray(report.enabledFeatures)
    ? report.enabledFeatures
    : [];
  if (!enabledFeatures.includes(FARFIELD_FEATURE_ID)) {
    return { enabled: false, verifiedPatchCount: 0 };
  }
  if (!Array.isArray(report.patches)) {
    throw new Error("Enabled Farfield build has no patch list");
  }

  const patchesByName = new Map(
    report.patches
      .filter((patch) => patch?.featureId === FARFIELD_FEATURE_ID)
      .map((patch) => [String(patch.name).split(":").at(-1), patch]),
  );
  const failures = [];
  for (const name of REQUIRED_PATCH_NAMES) {
    const patch = patchesByName.get(name);
    if (patch == null) {
      failures.push(`${name}: missing`);
    } else if (!SUCCESS_STATUSES.has(patch.status)) {
      failures.push(`${name}: ${String(patch.status)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Farfield bridge build verification failed: ${failures.join(", ")}`);
  }

  return {
    enabled: true,
    verifiedPatchCount: REQUIRED_PATCH_NAMES.length,
  };
}

function main(argv) {
  const reportPath = argv[2];
  if (!reportPath || argv.length !== 3) {
    console.error("Usage: verify-build.js <patch-report.json>");
    return 2;
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const result = verifyFarfieldPatchReport(report);
    if (result.enabled) {
      console.error(
        `[farfield] Verified ${String(result.verifiedPatchCount)} required bridge patches`,
      );
    }
    return 0;
  } catch (error) {
    console.error(`[farfield][ERROR] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = {
  verifyFarfieldPatchReport,
};
