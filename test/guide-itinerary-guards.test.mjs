// test/guide-itinerary-guards.test.mjs
//
// The three gaps left by the first guide-itinerary migration, pinned so they
// stay closed:
//   A. a companion re-syncs when a venue's status/slug or the author's role changes
//   B. the author cannot break a companion from the app
//   C. deleting a guide cannot leave a working public link behind
//
// The guard triggers in (B) sit on user_lists / user_list_items, which every
// app user writes to. The assertions about WHO they apply to matter most: a
// guard that fired for the wrong role would break list editing for everyone,
// or block account deletion.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261011050000_guide_itinerary_guards.sql");
const fn = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

test("A: venue status or slug changes re-sync, ordinary venue edits do not", () => {
  assert.match(sql, /after update of status, slug on public\.venues/);
  assert.match(sql, /when \(old\.status is distinct from new\.status or old\.slug is distinct from new\.slug\)/);
  const body = fn("venues_resync_guide_itineraries");
  assert.match(body, /lower\(old\.slug\), lower\(new\.slug\)/, "both the old and the new slug are considered");
  assert.match(body, /perform public\.sync_guide_itinerary\(r\.id\)/);
});

test("A: promoting or demoting an author re-syncs their guides", () => {
  assert.match(sql, /after update of role on public\.user_profiles/);
  assert.match(sql, /when \(old\.role is distinct from new\.role\)/);
  assert.match(fn("user_profiles_resync_guide_itineraries"), /g\.author_id = new\.user_id/);
});

test("A: a guide can never make a venue or profile write fail", () => {
  for (const name of ["venues_resync_guide_itineraries", "user_profiles_resync_guide_itineraries"]) {
    const body = fn(name);
    assert.match(body, /exception when others then/);
    assert.match(body, /raise warning/);
  }
});

test("B: the guards apply to direct client writes only", () => {
  for (const name of ["guard_guide_companion_list", "guard_guide_companion_items"]) {
    const body = fn(name);
    assert.match(
      body,
      /if current_user not in \('authenticated', 'anon'\) then\s*return coalesce\(new, old\);/,
      `${name} lets the sync, cascades, account deletion and the service role through`,
    );
    assert.doesNotMatch(body, /security definer/, `${name} must see the caller's role, not the owner's`);
    assert.doesNotMatch(body, /exception when/, `${name} must not swallow its own refusals`);
  }
});

test("B: ordinary lists pass straight through", () => {
  const list = fn("guard_guide_companion_list");
  // Every refusal is conditional on source_guide_id.
  const raises = list.split("raise exception").length - 1;
  const conditions = (list.match(/source_guide_id is (not null|distinct from)/g) ?? []).length;
  assert.equal(raises, 4);
  assert.ok(conditions >= 4, "each refusal is gated on the list being (or becoming) a companion");
  const items = fn("guard_guide_companion_items");
  const companionChecks = items.match(/l\.source_guide_id is not null/g) ?? [];
  assert.equal(companionChecks.length, 2, "item refusals only for items in a companion");
});

test("B: what an author may and may not change on a companion", () => {
  const list = fn("guard_guide_companion_list");
  for (const col of ["visibility", "share_token", "user_id"]) {
    assert.match(list, new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`), `${col} is locked`);
  }
  assert.doesNotMatch(list, /new\.name/, "renaming is allowed");
  const items = fn("guard_guide_companion_items");
  for (const col of ["list_id", "venue_id", "sort_order"]) {
    assert.match(items, new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`), `${col} is locked`);
  }
  assert.doesNotMatch(items, /new\.notes/, "notes stay editable");
});

test("C: retiring a deleted guide's link fails closed", () => {
  const body = fn("guides_retire_itinerary");
  assert.match(body, /update public\.user_lists set share_token = null/);
  assert.doesNotMatch(body, /exception when/, "a failure must abort the delete, not be swallowed");
});

test("definer functions pin search_path; nothing here is callable by clients", () => {
  const definers = sql.match(/security definer\s+set search_path = public/g) ?? [];
  assert.equal(definers.length, 3);
  const revokes = sql.match(/revoke all on function public\.\w+\(\) from public, anon, authenticated;/g) ?? [];
  assert.equal(revokes.length, 5, "all five functions are locked down");
});
