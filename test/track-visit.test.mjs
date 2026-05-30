import test from "node:test";
import assert from "node:assert/strict";

// ── Inlined mirror of the pure helpers in ─────────────────────────────────────
//    supabase/functions/track-visit/index.ts
// node:test cannot import the Deno edge function (URL imports + Deno.serve), so
// the pure decision logic is mirrored here. Keep these in exact sync with source.
const VALID_SOURCES = new Set(["qr", "app_checkin", "push_click", "organic"]);

function isValidSource(source) {
  return typeof source === "string" && VALID_SOURCES.has(source);
}

function buildRateKey(venueId, source, sessionId) {
  return `track-visit:${venueId}:${source}:${sessionId ?? "anon"}`;
}

function shouldRecord(rateLimitExceeded) {
  return rateLimitExceeded !== true;
}
// ──────────────────────────────────────────────────────────────────────────────

test("isValidSource accepts the four attribution sources", () => {
  for (const s of ["qr", "app_checkin", "push_click", "organic"]) {
    assert.equal(isValidSource(s), true, `${s} should be valid`);
  }
});

test("isValidSource rejects unknown / non-string sources", () => {
  for (const s of ["premium", "", "QR", null, undefined, 42, {}]) {
    assert.equal(isValidSource(s), false);
  }
});

test("buildRateKey is stable per (venue, source, session)", () => {
  assert.equal(
    buildRateKey("v1", "qr", "sess-abc"),
    "track-visit:v1:qr:sess-abc",
  );
  // Same inputs -> same key (so repeat scans collide in the rate limiter).
  assert.equal(
    buildRateKey("v1", "qr", "sess-abc"),
    buildRateKey("v1", "qr", "sess-abc"),
  );
});

test("buildRateKey differs across venue, source, and session", () => {
  const base = buildRateKey("v1", "qr", "s1");
  assert.notEqual(base, buildRateKey("v2", "qr", "s1")); // venue
  assert.notEqual(base, buildRateKey("v1", "app_checkin", "s1")); // source
  assert.notEqual(base, buildRateKey("v1", "qr", "s2")); // session
});

test("buildRateKey collapses sessionless hits to a single 'anon' key per venue+source", () => {
  // Two anonymous (no session) scans of the same venue+source share one key, so
  // the rate limiter caps them — they cannot be used to inflate counts.
  assert.equal(buildRateKey("v1", "qr", null), "track-visit:v1:qr:anon");
  assert.equal(buildRateKey("v1", "qr", null), buildRateKey("v1", "qr", null));
});

test("shouldRecord records the first call (not exceeded) and skips once exceeded", () => {
  // check_rate_limit returns FALSE on the first in-window call (count 1 > limit 1
  // is false) -> record; TRUE afterwards -> skip (deduped). This is the exact
  // semantics the edge function relies on; getting it backwards double-counts.
  assert.equal(shouldRecord(false), true, "first call must be recorded");
  assert.equal(shouldRecord(true), false, "subsequent calls must be deduped");
});
