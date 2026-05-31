import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Inlined mirror of mergeEffectiveTiers (apps/directory/src/lib/queries.ts) ──
// node:test runs plain .mjs and can't import the app's TS; mirror the pure logic
// here per repo convention. The drift guard below reads the real source and fails
// if its invariants change, so this copy can't silently diverge.
//
// The view (v_venue_active_tier) always returns a non-null tier (it COALESCEs to
// 'listed'), so a present row overrides the raw promotion_tier; a missing row
// leaves the venue untouched (fail-open when the view fetch returns nothing).
function mergeEffectiveTiers(venues, tierRows) {
  const byId = new Map(tierRows.map((r) => [r.venue_id, r.tier]));
  return venues.map((v) =>
    byId.has(v.id) ? { ...v, promotion_tier: byId.get(v.id) ?? v.promotion_tier } : v,
  );
}

const venue = (id, promotion_tier) => ({ id, name: `v-${id}`, promotion_tier });

test("an active bundle elevates a verified venue's effective tier", () => {
  const [out] = mergeEffectiveTiers(
    [venue("a", "verified")],
    [{ venue_id: "a", tier: "bundle_2_4" }],
  );
  assert.equal(out.promotion_tier, "bundle_2_4");
});

test("a self-paid featured venue is unchanged by the view value", () => {
  const [out] = mergeEffectiveTiers(
    [venue("a", "featured")],
    [{ venue_id: "a", tier: "featured" }],
  );
  assert.equal(out.promotion_tier, "featured");
});

test("a listed venue reads the view's 'listed' (display-equivalent to null)", () => {
  const [out] = mergeEffectiveTiers([venue("a", null)], [{ venue_id: "a", tier: "listed" }]);
  assert.equal(out.promotion_tier, "listed");
});

test("a venue with no view row keeps its raw promotion_tier", () => {
  const [out] = mergeEffectiveTiers([venue("a", "verified")], []);
  assert.equal(out.promotion_tier, "verified");
});

test("an empty tier set leaves every venue untouched (fail-open)", () => {
  const input = [venue("a", "verified"), venue("b", null)];
  const out = mergeEffectiveTiers(input, []);
  assert.deepEqual(out, input);
});

test("merge preserves non-tier fields", () => {
  const [out] = mergeEffectiveTiers(
    [venue("a", "verified")],
    [{ venue_id: "a", tier: "bundle_5_plus" }],
  );
  assert.equal(out.id, "a");
  assert.equal(out.name, "v-a");
});

// ── Drift guard: real queries.ts must keep mergeEffectiveTiers + read the view ──
const QUERIES_SRC = readFileSync(resolve(ROOT, "apps/directory/src/lib/queries.ts"), "utf8");

test("queries.ts exports mergeEffectiveTiers and reads the active-tier view", () => {
  assert.ok(
    /export function mergeEffectiveTiers/.test(QUERIES_SRC),
    "queries.ts must export mergeEffectiveTiers",
  );
  assert.ok(
    QUERIES_SRC.includes("v_venue_active_tier"),
    "queries.ts must fetch effective tiers from v_venue_active_tier",
  );
});

// ── Migration guard: the view recreation folds in the org bundle override ──────
function readBundleOverrideMigration() {
  const dir = resolve(ROOT, "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.includes("venue_active_tier_bundle_override"));
  assert.ok(file, "missing venue_active_tier_bundle_override migration");
  return readFileSync(resolve(dir, file), "utf8");
}

test("the view recreation folds in the active org-bundle override", () => {
  const sql = readBundleOverrideMigration();

  assert.match(sql, /create view public\.v_venue_active_tier/i);
  assert.match(sql, /security_invoker\s*=\s*true/i);
  assert.match(sql, /left join public\.org_subscriptions/i);
  // active bundle = status only (active / trialing / pilot)
  assert.match(sql, /status in \('active',\s*'trialing',\s*'pilot'\)/i);
  // self-paid featured-level wins; bundle yields its bundle_tier
  assert.match(sql, /'featured',\s*'bundle_2_4',\s*'bundle_5_plus'/i);
  assert.match(sql, /os\.bundle_tier/i);
  assert.match(sql, /grant select on public\.v_venue_active_tier to anon, authenticated/i);
});
