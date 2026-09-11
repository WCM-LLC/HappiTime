import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSocialUrl } from "./socialUrl.mjs";

test("empty / whitespace clears to null", () => {
  assert.deepEqual(normalizeSocialUrl(""), { ok: true, value: null });
  assert.deepEqual(normalizeSocialUrl("   "), { ok: true, value: null });
  assert.deepEqual(normalizeSocialUrl(null), { ok: true, value: null });
});

test("https url passes through trimmed", () => {
  assert.deepEqual(
    normalizeSocialUrl("  https://instagram.com/me  "),
    { ok: true, value: "https://instagram.com/me" }
  );
});

test("bare domain gets https:// prefix", () => {
  assert.deepEqual(
    normalizeSocialUrl("instagram.com/me"),
    { ok: true, value: "https://instagram.com/me" }
  );
});

test("http is upgraded to https", () => {
  assert.deepEqual(
    normalizeSocialUrl("http://example.com"),
    { ok: true, value: "https://example.com/" }
  );
});

test("javascript scheme is rejected", () => {
  const r = normalizeSocialUrl("javascript:alert(1)");
  assert.equal(r.ok, false);
});

test("data scheme is rejected", () => {
  const r = normalizeSocialUrl("data:text/html,<script>");
  assert.equal(r.ok, false);
});

test("garbage that cannot form a URL is rejected", () => {
  const r = normalizeSocialUrl("not a url at all");
  assert.equal(r.ok, false);
});
