import test from "node:test";
import assert from "node:assert/strict";
import { bytesToHex } from "../apps/mobile/src/lib/bytesToHex.mjs";

test("encodes bytes as lowercase hex", () => {
  assert.equal(bytesToHex(Uint8Array.from([0xde, 0xad, 0xbe, 0xef])), "deadbeef");
});

test("zero-pads bytes below 0x10 (the bug a naive toString(16) would hit)", () => {
  assert.equal(bytesToHex(Uint8Array.from([0x00, 0x01, 0x0f, 0x0a])), "00010f0a");
});

test("32 random-length bytes encode to exactly 64 hex chars", () => {
  assert.equal(bytesToHex(new Uint8Array(32)).length, 64);
});

test("empty input encodes to empty string", () => {
  assert.equal(bytesToHex(Uint8Array.from([])), "");
});
