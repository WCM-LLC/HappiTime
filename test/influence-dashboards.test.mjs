// test/influence-dashboards.test.mjs
//
// The Insider dashboards must show venue-level influence next to — never mixed
// into — recruited-user referral traffic, and the Insider-facing page must stay
// counts-only (it reads through the service client, so nothing but the
// self-filter stands between an Insider and other people's rows).
//
// Static wiring check. It does not prove the pages render.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const myQr = read("apps/web/src/app/dashboard/referrals/page.tsx");
const adminList = read("apps/web/src/app/admin/users/page.tsx");
const adminTable = read("apps/web/src/app/admin/users/SuperUsersTable.tsx");
const adminDetail = read("apps/web/src/app/admin/users/[userId]/page.tsx");
const migration = read("supabase/migrations/20261011031500_super_user_checkin_influence.sql");

const INFLUENCE_COLUMNS = ["influenced_checkins", "influenced_new_faces", "influenced_venues"];

test("every influence column the pages read exists in the migration", () => {
  for (const col of INFLUENCE_COLUMNS) {
    assert.match(migration, new RegExp(`as ${col}\\b`), `${col} is produced by a view`);
    assert.match(myQr, new RegExp(col), `My QR reads ${col}`);
    assert.match(adminDetail, new RegExp(col), `admin detail reads ${col}`);
  }
  assert.match(adminList, /influenced_checkins: traffic\?\.influenced_checkins/);
  assert.match(adminTable, />Influenced<\/th>/);
});

test("My QR keeps influence and referrals as separate sections", () => {
  const influence = myQr.indexOf("Your influence");
  const referrals = myQr.indexOf("Your referrals");
  assert.ok(influence !== -1 && referrals > influence);
  const influenceTiles = myQr.slice(myQr.indexOf("const influenceStats"), myQr.indexOf("const stats ="));
  assert.doesNotMatch(influenceTiles, /first_checkins_driven|referees/, "referral numbers stay out of the influence tiles");
});

test("My QR is self-only and counts-only", () => {
  const venueQuery = myQr.slice(myQr.indexOf(".from('super_user_venue_influence')"));
  const untilLimit = venueQuery.slice(0, venueQuery.indexOf(".limit("));
  assert.match(untilLimit, /\.eq\('super_user_id', user\.id\)/, "per-venue read is filtered to the signed-in Insider");
  assert.match(untilLimit, /\.select\('venue_id, influenced_checkins, influenced_new_faces'\)/);
  for (const table of ["checkin_super_user_attributions", "super_user_venue_touches"]) {
    assert.doesNotMatch(myQr, new RegExp(table), `My QR never reads row-level ${table}`);
  }
  assert.doesNotMatch(myQr, /['"`,\s]people['"`,\s]/, "no per-venue head-count on the Insider page");
});

test("admin detail shows the per-venue split between influence and referral", () => {
  assert.match(adminDetail, /\.from\('super_user_venue_influence'\)/);
  assert.match(adminDetail, /referral_first_checkins/);
  assert.match(adminDetail, /\.eq\('super_user_id', userId\)/);
});
