import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { venueQrUrl } from "../scripts/generate-venue-qrs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EDGE_SRC = readFileSync(
  resolve(__dirname, "../supabase/functions/track-visit/index.ts"),
  "utf8",
);

// ── Inlined mirror of the pure helpers in ─────────────────────────────────────
//    supabase/functions/track-visit/index.ts
// node:test cannot import the Deno edge function (URL imports + Deno.serve), so
// the pure decision logic is mirrored here. The "mirror stays in sync" test below
// reads the real source and fails if the mirrored invariants drift from it — so
// this copy cannot silently diverge from what is deployed.
const VALID_SOURCES = new Set(["qr", "app_checkin", "push_click", "organic"]);

function isValidSource(source) {
  return typeof source === "string" && VALID_SOURCES.has(source);
}

function cleanStr(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

test("cleanStr trims to a non-empty value, else null", () => {
  assert.equal(cleanStr("  sea-capitan  "), "sea-capitan");
  assert.equal(cleanStr("x"), "x");
  assert.equal(cleanStr("   "), null);
  assert.equal(cleanStr(""), null);
  assert.equal(cleanStr(undefined), null);
  assert.equal(cleanStr(null), null);
  assert.equal(cleanStr(42), null);
});

test("buildRateKey is stable per (venue, source, session)", () => {
  assert.equal(buildRateKey("v1", "qr", "sess-abc"), "track-visit:v1:qr:sess-abc");
  // Same inputs -> same key (so repeat scans collide in the rate limiter).
  assert.equal(buildRateKey("v1", "qr", "sess-abc"), buildRateKey("v1", "qr", "sess-abc"));
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

test("venueQrUrl builds the public /v/{slug}?src=qr landing URL (imported, not mirrored)", () => {
  assert.equal(
    venueQrUrl("sea-capitan", "https://happitime.app"),
    "https://happitime.app/v/sea-capitan?src=qr",
  );
  // slug is URL-encoded
  assert.equal(
    venueQrUrl("a b&c", "https://happitime.app"),
    "https://happitime.app/v/a%20b%26c?src=qr",
  );
});

// ── Drift guard ───────────────────────────────────────────────────────────────
// The helpers above are a copy of the edge function's logic. These tests read the
// REAL source and fail if its invariants change, so the mirror can't pass while
// the deployed behavior silently diverges (the exact failure that bit this code:
// duplicate shouldRecord, maybeSingle->limit(1)).
test("edge source still defines the same four sources as the mirror", () => {
  const m = EDGE_SRC.match(/VALID_SOURCES\s*=\s*new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, "VALID_SOURCES set literal not found in edge source");
  const sourcesInEdge = m[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, ""));
  assert.deepEqual(new Set(sourcesInEdge), VALID_SOURCES);
});

test("edge source keeps the buildRateKey shape the mirror asserts", () => {
  assert.ok(
    EDGE_SRC.includes("`track-visit:${venueId}:${source}:${sessionId ?? \"anon\"}`"),
    "edge buildRateKey template drifted from the mirror",
  );
});

test("edge source keeps the shouldRecord semantics (record unless exceeded)", () => {
  assert.ok(
    EDGE_SRC.includes("rateLimitExceeded !== true"),
    "edge shouldRecord logic drifted from the mirror",
  );
});

test("edge source resolves venues via limit(1), not maybeSingle (404-vs-500 fix)", () => {
  assert.ok(EDGE_SRC.includes(".limit(1)"), "expected limit(1) venue resolution");
  // Match the actual method call, not the word in the explanatory comment.
  assert.ok(
    !/\.maybeSingle\s*\(/.test(EDGE_SRC),
    "maybeSingle() call reintroduced — risks PGRST116 500s",
  );
});
