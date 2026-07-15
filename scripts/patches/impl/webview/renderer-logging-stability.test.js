"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyLinuxRendererLoggingGuardPatch,
} = require("./index.js");

test("renderer logging never propagates a synchronous bridge failure", () => {
  const source =
    "function qPe(e){AC=e}function JPe(e){AC?.(`log-message`,e)}function jC(e,t,n){JPe({level:e,message:t,tags:n})}";

  const patched = applyLinuxRendererLoggingGuardPatch(source);

  assert.notEqual(patched, source);
  assert.match(patched, /codexLinuxRendererLoggingGuard/);
  assert.match(
    patched,
    /function JPe\(e\)\{try\{AC\?\.\(`log-message`,e\)\}catch\{\}\}/,
  );
  assert.equal(applyLinuxRendererLoggingGuardPatch(patched), patched);
});
