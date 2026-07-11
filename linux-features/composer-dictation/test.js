"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyLinuxDictationAvailabilityPatch,
  descriptors,
} = require("./patch.js");

test("enables the current upstream dictation availability gate on Linux", () => {
  const source =
    "function a(){let e=Ql(`3207467860`),t=n,r=o(i);return {isDictationButtonVisible:r}}";
  const patched = applyLinuxDictationAvailabilityPatch(source);

  assert.equal(
    patched,
    'function a(){let e=Ql(`3207467860`),t=n,r=navigator.userAgent.includes("Linux")?!0:o(i);return {isDictationButtonVisible:r}}',
  );
});

test("is idempotent", () => {
  const source =
    'function a(){let e=Ql(`3207467860`),t=n,r=navigator.userAgent.includes("Linux")?!0:o(i);return {isDictationButtonVisible:r}}';
  assert.equal(applyLinuxDictationAvailabilityPatch(source), source);
});

test("does not modify unrelated assets", () => {
  const source = "function unrelated(){return true}";
  assert.equal(applyLinuxDictationAvailabilityPatch(source), source);
});

test("targets the current composer page asset", () => {
  assert.equal(descriptors.length, 1);
  assert.equal(descriptors[0].pattern.test("app-initial~app-main~page-C8oHn.js"), true);
  assert.equal(descriptors[0].pattern.test("assistant-message-C8oHn.js"), false);
});
