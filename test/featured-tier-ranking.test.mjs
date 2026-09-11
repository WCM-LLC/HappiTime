// test/featured-tier-ranking.test.mjs
//
// Featured is a $99/mo promise: a Featured venue ranks first in its sector and
// in search. On 2026-08-12 that promise was not kept anywhere. Searching
// "vine" put Vine Street Brewing (founding_pilot, which maps to the featured
// variant) below the seven venues that merely sit in the 18th & Vine
// neighborhood, because BOTH surfaces match neighborhood text.
//
// Four distinct causes, one test each:
//   1. the web list (KCMapPage) filtered and rendered with no sort at all
//   2. mobile search ran no ORDER BY and ignored org-bundle tiers
//   3. the mobile feed sorted on promotion_priority, which is 0 for every
//      venue in production — a no-op that fell through to distance
//   4. venue-only search matches were appended last unconditionally, so a
//      venue whose window is unpublished could never outrank a free listing

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

// Mirror of the shared rank: featured -> verified -> listed.
const FEATURED_LEVEL = new Set(["featured", "founding_pilot", "bundle_2_4", "bundle_5_plus"]);
const rank = (tier) => (tier && FEATURED_LEVEL.has(tier) ? 0 : tier === "verified" ? 1 : 2);
const compare = (a, b) =>
  rank(a.promotion_tier) - rank(b.promotion_tier) ||
  (b.promotion_priority ?? 0) - (a.promotion_priority ?? 0) ||
  (b.rating ?? 0) - (a.rating ?? 0);

test("a founding pilot outranks free listings with the same priority", () => {
  // The real prod shape: every venue at priority 0, only VSB with a tier.
  const matches = [
    { name: "Arthur Bryant's Barbeque", promotion_tier: null, promotion_priority: 0, rating: null },
    { name: "The Blue Room", promotion_tier: null, promotion_priority: 0, rating: null },
    { name: "The Velvet Freeze Daiquiris", promotion_tier: null, promotion_priority: 0, rating: 4.4 },
    { name: "Vine Street Brewing Co.", promotion_tier: "founding_pilot", promotion_priority: 0, rating: null },
  ];
  const ordered = [...matches].sort(compare);
  assert.equal(ordered[0].name, "Vine Street Brewing Co.");
});

test("tier beats rating, and priority breaks ties inside a tier", () => {
  // A well-rated free listing must not outrank a paying venue.
  const ordered = [
    { name: "free but loved", promotion_tier: null, promotion_priority: 9, rating: 5 },
    { name: "verified", promotion_tier: "verified", promotion_priority: 0, rating: 1 },
    { name: "featured", promotion_tier: "featured", promotion_priority: 0, rating: 1 },
  ].sort(compare);
  assert.deepEqual(ordered.map((v) => v.name), ["featured", "verified", "free but loved"]);

  const withinTier = [
    { name: "b", promotion_tier: "featured", promotion_priority: 1, rating: 0 },
    { name: "a", promotion_tier: "featured", promotion_priority: 5, rating: 0 },
  ].sort(compare);
  assert.deepEqual(withinTier.map((v) => v.name), ["a", "b"]);
});

test("every bundle tier counts as featured", () => {
  // A venue paying through an org bundle carries a bundle tier, not "featured".
  for (const tier of ["featured", "founding_pilot", "bundle_2_4", "bundle_5_plus"]) {
    assert.equal(rank(tier), 0, `${tier} must rank as featured`);
  }
  assert.equal(rank("verified"), 1);
  assert.equal(rank(null), 2);
  assert.equal(rank("listed"), 2);
});

test("the web list is sorted, not just filtered", () => {
  const page = read("apps/directory/src/components/KCMapPage.tsx");
  assert.match(page, /import \{ compareByTier \} from "@\/lib\/venueTier"/);
  assert.match(page, /\.sort\(compareByTier\)/, "filteredVenues must be ordered before render");
});

test("mobile search ranks results and folds in bundle tiers", () => {
  const hook = read("apps/mobile/src/hooks/useVenueSearch.ts");
  assert.match(hook, /function rankVenues/);
  assert.match(hook, /setVenues\(rankVenues\(withTiers\)\)/, "raw rows must never reach state unranked");
  // Without the effective tier, a bundle-paying venue ranks as a free listing.
  assert.match(hook, /mergeEffectiveTiers/);
  assert.match(hook, /fetchEffectiveTierRows/);
});

test("the mobile feed consults tier before priority", () => {
  const home = read("apps/mobile/src/screens/HomeScreen.tsx");
  assert.match(home, /const aRank = tierRank\(\(a\.venue as any\)\?\.promotion_tier\)/);
  // The old sort's first key was priority; tier now precedes it.
  const feedSort = home.slice(home.indexOf("Tier first"), home.indexOf("Then by distance"));
  assert.ok(
    feedSort.indexOf("aRank") < feedSort.indexOf("getPromoPriority"),
    "tier must be compared before promotion_priority"
  );
});

test("venue-only matches are ranked in, not pinned to the bottom", () => {
  const home = read("apps/mobile/src/screens/HomeScreen.tsx");
  assert.doesNotMatch(
    home,
    /list = \[\.\.\.list, \.\.\.venueOnlyResults\];/,
    "appending unconditionally is the bug — a featured venue landed last"
  );
  assert.match(home, /\[\.\.\.list, \.\.\.venueOnlyResults\]\.sort\(/);
});
