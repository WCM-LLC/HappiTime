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
  assert.match(body, /s\.slug in \(v_old_slug, v_new_slug\)/, "both the old and the new slug are considered");
  assert.match(body, /if tg_op = 'UPDATE' then\s*v_new_slug := lower\(new\.slug\);/, "NEW is only read on UPDATE");
  assert.match(body, /perform public\.sync_guide_itinerary\(r\.id\)/);
});

test("A: deleting a venue is an eligibility change too", () => {
  // This project hard-deletes unwanted venues. The cascade removes the item, so
  // without this a guide whose only venue was deleted would keep a live link.
  assert.match(sql, /create trigger venues_resync_guide_itineraries_del_trg\s+after delete on public\.venues/);
});

test("A: promoting or demoting an author re-syncs their guides", () => {
  assert.match(sql, /after update of role on public\.user_profiles/);
  assert.match(sql, /when \(old\.role is distinct from new\.role\)/);
  const body = fn("user_profiles_resync_guide_itineraries");
  assert.match(body, /v_user uuid := old\.user_id;/);
  assert.match(body, /g\.author_id = v_user/);
  assert.doesNotMatch(body, /new\./, "NEW does not exist on DELETE");
  assert.match(sql, /create trigger user_profiles_resync_guide_itineraries_del_trg\s+after delete on public\.user_profiles/);
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
    assert.match(body, /if current_user not in \('authenticated', 'anon'\) then/);
    const privileged = body.slice(body.indexOf("if current_user not in"), body.indexOf("end if;\n\n  if tg_op"));
    assert.match(privileged, /return coalesce\(new, old\);/, `${name} lets the sync, cascades, account deletion and the service role through`);
    assert.doesNotMatch(privileged, /tg_op = 'DELETE'/, `${name} never blocks a privileged delete (cascades, account deletion)`);
    assert.doesNotMatch(body, /security definer/, `${name} must see the caller's role, not the owner's`);
    assert.doesNotMatch(body, /exception when/, `${name} must not swallow its own refusals`);
  }
});

test("B: ordinary lists pass straight through", () => {
  const list = fn("guard_guide_companion_list");
  // Every refusal is conditional on source_guide_id.
  const raises = list.split("raise exception").length - 1;
  const conditions = (list.match(/source_guide_id is (not null|distinct from)/g) ?? []).length;
  assert.equal(raises, 5);
  assert.ok(conditions >= 5, "each refusal is gated on the list being (or becoming) a companion");
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

test("B: only the guide sync can give a retired companion its link back", () => {
  // ensure_share_token is SECURITY DEFINER, so the app's ordinary share button
  // would otherwise revive a companion retired with its guide.
  const list = fn("guard_guide_companion_list");
  assert.match(list, /old\.share_token is null\s+and new\.share_token is not null\s+and coalesce\(current_setting\('happitime\.guide_sync', true\), ''\) <> 'on'/);
  const sync = fn("sync_guide_itinerary");
  assert.match(sync, /perform set_config\('happitime\.guide_sync', 'on', true\);/);
  const offs = sync.match(/perform set_config\('happitime\.guide_sync', 'off', true\);/g) ?? [];
  const returns = sync.match(/\n\s+return (null|v_list_id);/g) ?? [];
  assert.equal(offs.length, returns.length, "the flag is switched off on every way out");
});

test("B: the sync puts an existing companion back to private, live or retired", () => {
  const sync = fn("sync_guide_itinerary");
  const privates = sync.match(/visibility\s+= 'private'/g) ?? [];
  assert.equal(privates.length, 2, "one in the retire branch, one in the refresh branch");
  assert.match(sync, /share_token is not null or visibility <> 'private'/);
});

test("the restated sync keeps the eligibility rules from the first migration", () => {
  const first = read("supabase/migrations/20261011041500_guide_itineraries.sql");
  const a = first.indexOf("create or replace function public.sync_guide_itinerary(");
  const original = first.slice(a, first.indexOf("$$;", a));
  const strip = (t) =>
    t
      .split("\n")
      .filter((l) => !/happitime\.guide_sync|visibility\s+= 'private'|Tells guard_guide|allowed to give a retired|switched off again|update public\.user_lists\s*$|set share_token = null|where id = v_list_id and/.test(l))
      .join("\n")
      .replace(/\n{2,}/g, "\n");
  assert.equal(strip(fn("sync_guide_itinerary")), strip(original), "only the flag and the visibility line differ");
});

test("C: retiring a deleted guide's link fails closed", () => {
  const body = fn("guides_retire_itinerary");
  assert.match(body, /update public\.user_lists set share_token = null/);
  assert.doesNotMatch(body, /exception when/, "a failure must abort the delete, not be swallowed");
});

test("definer functions pin search_path; nothing here is callable by clients", () => {
  const definers = sql.match(/security definer\s+set search_path = public/g) ?? [];
  assert.equal(definers.length, 4);
  const revokes = sql.match(/revoke all on function public\.\w+\(\) from public, anon, authenticated;/g) ?? [];
  assert.equal(revokes.length, 5, "all five trigger functions are locked down");
  assert.ok(sql.includes("revoke all on function public.sync_guide_itinerary(uuid) from public, anon, authenticated;"));
});
