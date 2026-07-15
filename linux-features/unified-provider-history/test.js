#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");
const { applyUnifiedProviderHistoryPatch } = require("./patch.js");

test("lists threads across all model providers for current request shapes", () => {
  const source = [
    "await r(`thread/list`,{limit:200,modelProviders:null,archived:!1});",
    "let i={limit:t,modelProviders:null,archived:!1},a=await this.sendRequest(`thread/list`,i);",
    "return this.listAllThreads({modelProviders:null,archived:!0});",
    "await this.sendRequest(`account/read`,{modelProviders:null});",
  ].join("");

  const patched = applyUnifiedProviderHistoryPatch(source);
  assert.equal((patched.match(/modelProviders:\[\]/g) ?? []).length, 3);
  assert.match(patched, /`account\/read`,\{modelProviders:null\}/);
  assert.equal(applyUnifiedProviderHistoryPatch(patched), patched);
});

test("leaves assets without thread-list behavior unchanged", () => {
  const source = "sendRequest(`account/read`,{modelProviders:null})";
  assert.equal(applyUnifiedProviderHistoryPatch(source), source);
});

test("registers one optional webview descriptor only when enabled", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-unified-history-"));
  const previous = process.env.CODEX_LINUX_FEATURES_CONFIG;
  process.env.CODEX_LINUX_FEATURES_CONFIG = path.join(temp, "features.json");
  try {
    fs.writeFileSync(process.env.CODEX_LINUX_FEATURES_CONFIG, JSON.stringify({ enabled: [] }));
    assert.deepEqual(
      loadLinuxFeaturePatchDescriptors({ featuresRoot: path.resolve(__dirname, "..") }),
      [],
    );
    fs.writeFileSync(
      process.env.CODEX_LINUX_FEATURES_CONFIG,
      JSON.stringify({ enabled: ["unified-provider-history"] }),
    );
    const descriptors = loadLinuxFeaturePatchDescriptors({
      featuresRoot: path.resolve(__dirname, ".."),
    });
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].phase, "webview-asset");
    assert.equal(descriptors[0].ciPolicy, "optional");
  } finally {
    if (previous == null) delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    else process.env.CODEX_LINUX_FEATURES_CONFIG = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
