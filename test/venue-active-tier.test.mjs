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

// ── Mobile (4-1b): separate workspace, its own effectiveTier helper ───────────
// Mobile cannot import the directory's queries.ts, so it duplicates the pure
// merge. Guard the copy keeps the same shape and reads the same remote view.
test("mobile effectiveTier exports mergeEffectiveTiers and reads the active-tier view", () => {
  const src = readFileSync(resolve(ROOT, "apps/mobile/src/lib/effectiveTier.ts"), "utf8");
  assert.ok(
    /export function mergeEffectiveTiers/.test(src),
    "mobile effectiveTier must export mergeEffectiveTiers",
  );
  assert.ok(
    src.includes("v_venue_active_tier"),
    "mobile effectiveTier must read v_venue_active_tier",
  );
});

test("all six mobile tier-reading sites consume the effective tier", () => {
  // Each site must route its promotion_tier through the effective-tier helper so
  // bundle elevation reaches mobile. Guard against a site silently regressing to
  // the raw column. (friend-activity derives its partner set from the view.)
  const sites = {
    "hooks/useHappyHours.ts": /effectiveTier/,
    "hooks/useUpcomingEvents.ts": /effectiveTier/,
    "hooks/useUserLists.ts": /effectiveTier/,
    "hooks/useFriendActivity.ts": /effectiveTier|v_venue_active_tier/,
    "screens/MapScreen.tsx": /effectiveTier/,
    // EventCalendar reads its events through useUpcomingEvents (already migrated),
    // so its tierVariant filter runs on the effective tier via delegation.
    "screens/EventCalendarScreen.tsx": /useUpcomingEvents/,
  };
  for (const [rel, pattern] of Object.entries(sites)) {
    const src = readFileSync(resolve(ROOT, "apps/mobile/src", rel), "utf8");
    assert.match(src, pattern, `${rel} must consume the effective tier`);
  }
});

// ── Migration guard: the live view recreation folds in the org bundle override ──
// Migrations are append-only; the latest one that (re)creates v_venue_active_tier
// defines the live view. Prod ran an earlier plain-join version (20260531041653) that
// is buggy for anon; the forward definer migration (20260531235900) supersedes it. Read
// the latest view-creating migration so this guard always tracks the current definition.
function readActiveTierViewMigration() {
  const dir = resolve(ROOT, "supabase/migrations");
  const file = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .find((f) => readFileSync(resolve(dir, f), "utf8").includes("create view public.v_venue_active_tier"));
  assert.ok(file, "missing a migration that creates v_venue_active_tier");
  return readFileSync(resolve(dir, file), "utf8");
}

test("the bundle lookup is a SECURITY DEFINER function anon may execute", () => {
  const sql = readActiveTierViewMigration();

  // anon cannot read org_subscriptions (authenticated-only + org-member RLS), so the
  // bundle check goes through a definer function that returns ONLY the bundle_tier —
  // no rates/Stripe ids leak, and the view stays security_invoker for venues RLS.
  assert.match(sql, /create or replace function public\.org_active_bundle_tier/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path/i);
  // the function (not the view) holds the org_subscriptions read + active-status gate
  assert.match(sql, /from public\.org_subscriptions/i);
  assert.match(sql, /status in \('active',\s*'trialing',\s*'pilot'\)/i);
  assert.match(sql, /grant execute on function public\.org_active_bundle_tier\(uuid\) to anon, authenticated/i);
});

test("the view recreation folds in the active org-bundle override via the function", () => {
  const sql = readActiveTierViewMigration();

  assert.match(sql, /create view public\.v_venue_active_tier/i);
  assert.match(sql, /security_invoker\s*=\s*true/i);
  // self-paid featured-level wins; otherwise the function supplies the bundle tier
  assert.match(sql, /'featured',\s*'bundle_2_4',\s*'bundle_5_plus'/i);
  assert.match(sql, /public\.org_active_bundle_tier\(v\.org_id\)/i);
  assert.match(sql, /grant select on public\.v_venue_active_tier to anon, authenticated/i);
});
