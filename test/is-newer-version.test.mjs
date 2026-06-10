import test from "node:test";
import assert from "node:assert/strict";
import { isNewerVersion } from "../apps/mobile/src/lib/isNewerVersion.mjs";

test("true when latest patch is higher", () => {
  assert.equal(isNewerVersion("1.0.4", "1.0.3"), true);
});
test("numeric (not lexical) comparison", () => {
  assert.equal(isNewerVersion("1.0.10", "1.0.9"), true);
});
test("false when equal", () => {
  assert.equal(isNewerVersion("1.0.4", "1.0.4"), false);
});
test("false when latest is older", () => {
  assert.equal(isNewerVersion("1.0.3", "1.0.4"), false);
});
test("treats missing segments as zero", () => {
  assert.equal(isNewerVersion("1.1", "1.0.9"), true);
  assert.equal(isNewerVersion("1.0", "1.0.0"), false);
});
test("malformed or non-string input is not newer (fail safe)", () => {
  assert.equal(isNewerVersion("1.0.x", "1.0.0"), false);
  assert.equal(isNewerVersion("", "1.0.0"), false);
  assert.equal(isNewerVersion(null, "1.0.0"), false);
  assert.equal(isNewerVersion("1.0.1", undefined), false);
});
