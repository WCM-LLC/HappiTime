import test from "node:test";
import assert from "node:assert/strict";

// ── Inlined mirror of apps/directory/src/lib/venueTier.ts ─────────────────────
// node:test runs plain .mjs and can't import the app's TS; mirror the pure logic
// here per repo convention. The drift guard at the bottom reads the real source
// and fails if its invariants change, so this copy can't silently diverge.
const FEATURED_LEVEL = new Set(["featured", "founding_pilot", "bundle_2_4", "bundle_5_plus"]);

function tierVariant(t) {
  if (t && FEATURED_LEVEL.has(t)) return "featured";
  if (t === "verified") return "verified";
  return "listed";
}
const RANK = { featured: 0, verified: 1, listed: 2 };
function compareByTier(a, b) {
  const r = RANK[tierVariant(a.promotion_tier)] - RANK[tierVariant(b.promotion_tier)];
  if (r !== 0) return r;
  const prio = (b.promotion_priority ?? 0) - (a.promotion_priority ?? 0);
  if (prio !== 0) return prio;
  return (b.rating ?? 0) - (a.rating ?? 0);
}
function capFeaturedRuns(venues, maxRun = 3) {
  const featured = [];
  const rest = [];
  for (const v of venues) (tierVariant(v.promotion_tier) === "featured" ? featured : rest).push(v);
  if (featured.length <= maxRun || rest.length === 0) return venues;
  const out = [];
  let fi = 0;
  let ri = 0;
  while (fi < featured.length) {
    for (let k = 0; k < maxRun && fi < featured.length; k++) out.push(featured[fi++]);
    if (fi < featured.length && ri < rest.length) out.push(rest[ri++]);
  }
  while (ri < rest.length) out.push(rest[ri++]);
  return out;
}
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../apps/directory/src/lib/venueTier.ts"),
  "utf8",
);

const v = (promotion_tier, promotion_priority = 0, rating = null) => ({
  promotion_tier,
  promotion_priority,
  rating,
});

test("tierVariant: featured-level tiers all collapse to 'featured'", () => {
  for (const t of ["featured", "founding_pilot", "bundle_2_4", "bundle_5_plus"]) {
    assert.equal(tierVariant(t), "featured", `${t} should be featured`);
  }
});

test("tierVariant: verified is its own variant; everything else is listed", () => {
  assert.equal(tierVariant("verified"), "verified");
  assert.equal(tierVariant("listed"), "listed");
  assert.equal(tierVariant(null), "listed");
  assert.equal(tierVariant(undefined), "listed");
  assert.equal(tierVariant("premium"), "listed"); // retired tier no longer special
  assert.equal(tierVariant("basic"), "listed"); // retired tier no longer special
});

test("compareByTier orders featured → verified → listed", () => {
  const arr = [v("listed"), v("featured"), v("verified")].sort(compareByTier);
  assert.deepEqual(arr.map((x) => tierVariant(x.promotion_tier)), ["featured", "verified", "listed"]);
});

test("compareByTier tiebreaks within a tier by priority desc, then rating desc", () => {
  const a = v("featured", 10, 4.0);
  const b = v("featured", 30, 2.0);
  const c = v("featured", 10, 4.9);
  const sorted = [a, b, c].sort(compareByTier);
  assert.equal(sorted[0], b, "highest priority first");
  assert.equal(sorted[1], c, "then higher rating among equal priority");
  assert.equal(sorted[2], a);
});

test("capFeaturedRuns inserts a non-featured after every 3 featured", () => {
  const F = () => v("featured");
  const V = () => v("verified");
  // 7 featured, 2 verified → runs of featured capped at 3.
  const input = [F(), F(), F(), F(), F(), F(), F(), V(), V()];
  const out = capFeaturedRuns(input, 3);
  const variants = out.map((x) => tierVariant(x.promotion_tier));
  // No more than 3 featured in a row.
  let run = 0;
  for (const t of variants) {
    run = t === "featured" ? run + 1 : 0;
    assert.ok(run <= 3, `featured run exceeded 3: ${variants.join(",")}`);
  }
  // All 9 venues preserved.
  assert.equal(out.length, 9);
  assert.equal(variants.filter((t) => t === "featured").length, 7);
});

test("capFeaturedRuns is a no-op when featured count <= maxRun", () => {
  const input = [v("featured"), v("featured"), v("verified")];
  assert.equal(capFeaturedRuns(input, 3), input); // same reference, untouched
});

test("capFeaturedRuns leaves all-featured list intact when nothing to interleave", () => {
  const input = [v("featured"), v("featured"), v("featured"), v("featured")];
  assert.equal(capFeaturedRuns(input, 3), input); // rest is empty → returned as-is
});

// ── Drift guard: real source must keep the invariants the mirror encodes ──────
test("source defines the same featured-level tier set as the mirror", () => {
  for (const t of FEATURED_LEVEL) {
    assert.ok(SRC.includes(`"${t}"`), `venueTier.ts missing featured-level tier ${t}`);
  }
});

test("source keeps verified as its own variant and featured rank 0", () => {
  assert.ok(/RANK[^=]*=\s*\{\s*featured:\s*0/.test(SRC), "featured must rank 0 in source");
  assert.ok(SRC.includes('=== "verified"'), "verified branch missing from source");
});

// ── Mobile copy drift guard ───────────────────────────────────────────────────
// apps/mobile is a separate workspace and CANNOT import the directory's venueTier,
// so it has its own apps/mobile/src/lib/venueTier.ts duplicating this mapping.
// Guard the two stay in sync on the tier-set + verified invariants.
const MOBILE_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../apps/mobile/src/lib/venueTier.ts"),
  "utf8",
);

test("mobile venueTier mirrors the same featured-level tier set", () => {
  for (const t of FEATURED_LEVEL) {
    assert.ok(MOBILE_SRC.includes(`"${t}"`), `mobile venueTier missing featured-level tier ${t}`);
  }
});

test("mobile venueTier keeps verified its own variant", () => {
  assert.ok(MOBILE_SRC.includes('=== "verified"'), "mobile venueTier missing verified branch");
});
