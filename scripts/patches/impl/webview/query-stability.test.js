"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyLinuxQueryStructuralSharingGuardPatch,
} = require("./index.js");

test("query structural sharing does not call a corrupted hasOwnProperty alias", () => {
  const source =
    "function D(e,t){return n?c<r:re.call(e,a)}function N(e,t,n){return D(e,t)}";

  const patched = applyLinuxQueryStructuralSharingGuardPatch(source);

  assert.notEqual(patched, source);
  assert.match(patched, /codexLinuxQueryStructuralSharingGuard/);
  assert.match(patched, /Object\.prototype\.hasOwnProperty\.call\(e,a\)/);
  assert.equal(
    applyLinuxQueryStructuralSharingGuardPatch(patched),
    patched,
  );
});
