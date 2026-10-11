// test/guide-itineraries.test.mjs
//
// How a Guide earns its author check-in credit: the venues it LINKS to become a
// companion itinerary, and the public guide page sends readers into the app
// through an ordinary /i/{token} link. From there the itinerary attribution
// built in 20261011031500 does the rest — there is no separate "guide" path.
//
// The link parser exists twice (SQL builds the itinerary; JS powers the editor
// hint). The first tests keep them from drifting.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  GUIDE_VENUE_LINK_PATTERN,
  guideVenueSlugs,
} from "../apps/web/src/utils/guideVenueLinks.mjs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261011041500_guide_itineraries.sql");
const guidePage = read("apps/directory/src/app/guides/[slug]/page.tsx");
const editor = read("apps/web/src/app/dashboard/guides/components/GuideEditor.tsx");

const fn = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

test("the SQL and JS link patterns are the same pattern", () => {
  const m = fn("guide_venue_slugs").match(/'(\(\?:happitime[^']+)'/);
  assert.ok(m, "found the pattern literal in guide_venue_slugs");
  assert.equal(m[1], GUIDE_VENUE_LINK_PATTERN);
  assert.match(fn("guide_venue_slugs"), /'gi'/, "SQL matches case-insensitively, like the JS");
});

test("venue links are found in every form authors actually use", () => {
  const body = [
    "Start at [Brown & Loe](https://happitime.biz/kc/kansas-city/brown-loe)",
    "then [Stock Hill](https://happitime.biz/kc/kansas-city/stock-hill/),",
    "a relative [link](/kc/westport/the-peanut) and a QR-style https://happitime.biz/v/Yard-House.",
  ].join("\n");
  assert.deepEqual(guideVenueSlugs(body), ["brown-loe", "stock-hill", "the-peanut", "yard-house"]);
});

test("repeats collapse to first appearance; non-venue links are ignored", () => {
  const body = [
    "[A](/kc/a/one) [B](/kc/a/two) [A again](https://happitime.biz/kc/a/one/)",
    "[Westport](/kc/westport/) [All KC](/kc/) [App](https://happitime.biz/app)",
    "[Elsewhere](https://example.com/kc/a/three) and plain text /kc/a/four",
  ].join("\n");
  assert.deepEqual(guideVenueSlugs(body), ["one", "two"]);
  assert.deepEqual(guideVenueSlugs(""), []);
  assert.deepEqual(guideVenueSlugs(null), []);
});

test("a companion exists only for a published guide by an Insider with a linked, published venue", () => {
  const body = fn("sync_guide_itinerary");
  assert.match(body, /v_guide\.status = 'published'/);
  assert.match(body, /p\.role = 'super_user'/);
  const venueJoins = body.match(/v\.slug = s\.slug and v\.status = 'published'/g) ?? [];
  assert.equal(venueJoins.length, 3, "count, prune and insert all resolve published venues only");
  // Not live → the public link must die, but the author's list is not destroyed.
  assert.match(body, /update public\.user_lists set share_token = null/);
  assert.doesNotMatch(body, /delete from public\.user_lists\b/);
});

test("the companion is private-with-token, one per guide, owned by the author", () => {
  const body = fn("sync_guide_itinerary");
  assert.match(body, /'private',\s*gen_random_uuid\(\), p_guide_id\)/, "not public: stays out of the in-app feed");
  assert.match(body, /\(v_guide\.author_id, left\(v_guide\.title, 100\)/, "owner = author, so the author earns the touches");
  assert.match(sql, /create unique index if not exists user_lists_source_guide_id_key/);
});

test("guide saves, publishes and deletes can never be blocked by the sync", () => {
  for (const name of ["guides_sync_itinerary", "guides_retire_itinerary"]) {
    const body = fn(name);
    assert.match(body, /exception when others then/);
    assert.match(body, /raise warning/);
  }
  assert.match(sql, /after insert or update of body_md, status, title, subtitle, author_id on public\.guides/);
  assert.match(sql, /before delete on public\.guides/);
});

test("the share token is only as public as the guide", () => {
  const body = fn("get_guide_itinerary");
  assert.match(body, /g\.status = 'published'/);
  assert.match(body, /l\.share_token is not null/);
  assert.match(sql, /grant execute on function public\.get_guide_itinerary\(uuid\) to anon, authenticated/);
  for (const internal of ["sync_guide_itinerary(uuid)", "guide_venue_slugs(text)"]) {
    assert.ok(
      sql.includes(`revoke all on function public.${internal} from public, anon, authenticated`),
      `${internal} is not callable by clients`,
    );
  }
  const definers = sql.match(/security definer\s+set search_path = public/g) ?? [];
  assert.equal(definers.length, 4);
});

test("the guide page links into the app with the share-sheet URL shape, and hides the card when there is nothing to open", () => {
  assert.match(guidePage, /supabase\.rpc\("get_guide_itinerary", \{ p_guide_id: guideId \}\)/);
  assert.match(guidePage, /`\/i\/\$\{itinerary\.token\}\$\{itinerary\.author_handle \? `\?ref=\$\{encodeURIComponent\(itinerary\.author_handle\)\}` : ""\}`/);
  assert.match(guidePage, /if \(!row\.token \|\| !row\.spots\) return null;/);
  assert.match(guidePage, /\{itinerary && itineraryHref \? \(/);
});

test("the editor tells authors how many venues are linked", () => {
  assert.match(editor, /guideVenueSlugs\(bodyMd\)\.length/);
  assert.match(editor, /linked\./);
});
