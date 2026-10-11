// test/super-user-checkin-influence.test.mjs
//
// How an Insider earns credit for a check-in. Pinned in SQL because each of
// these is a product decision someone could plausibly "tidy" into something
// else: the 7-day window, last-touch-wins, the referral fallback applying to a
// first check-in only, and the fact that attribution can never fail a check-in.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../supabase/migrations/20261011031500_super_user_checkin_influence.sql",
    import.meta.url,
  ),
  "utf8",
);

const fn = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

test("the lookback window is 7 days, measured back from the check-in", () => {
  const body = fn("attribute_checkin_to_super_user");
  assert.match(body, /v_window\s+constant interval := interval '7 days'/);
  assert.match(body, /t\.created_at <= new\.created_at/);
  assert.match(body, /t\.created_at > new\.created_at - v_window/);
  assert.doesNotMatch(body, /now\(\)/, "the clock is the check-in, not the wall");
});

test("last touch wins, and only for the same user at the same venue", () => {
  const body = fn("attribute_checkin_to_super_user");
  assert.match(body, /t\.user_id = new\.user_id/);
  assert.match(body, /t\.venue_id = new\.venue_id/);
  assert.match(body, /order by t\.created_at desc/);
  assert.match(body, /limit 1/);
});

test("a touch only counts while its author is still an Insider", () => {
  assert.match(fn("attribute_checkin_to_super_user"), /p\.role = 'super_user'/);
});

test("referral is a fallback, for a first check-in at the venue only", () => {
  const body = fn("attribute_checkin_to_super_user");
  const touch = body.indexOf("'venue_touch'");
  const referral = body.indexOf("'referral'");
  assert.ok(touch !== -1 && referral > touch, "venue touch is tried before referral");
  assert.match(body, /elsif v_first then/);
  assert.match(body, /r\.created_at <= new\.created_at/, "referred before checking in");
});

test("every credit says which basis earned it", () => {
  assert.match(sql, /basis\s+text not null check \(basis in \('venue_touch', 'referral'\)\)/);
  assert.match(sql, /check \(\(basis = 'venue_touch'\) = \(touch_kind is not null\)\)/);
});

test("one credit per check-in", () => {
  assert.match(sql, /checkin_id\s+uuid primary key references public\.checkins\(id\)/);
});

test("attribution can never fail a check-in or an itinerary save", () => {
  for (const name of ["attribute_checkin_to_super_user", "log_itinerary_save_touches"]) {
    const body = fn(name);
    assert.match(body, /exception when others then/, `${name} swallows its own errors`);
    assert.match(body, /raise warning/, `${name} still leaves a trace`);
  }
  assert.match(sql, /after insert on public\.checkins/, "AFTER, so it cannot alter the row");
});

test("the client can only log its own touches, and never names the Insider", () => {
  const body = fn("record_itinerary_touch");
  assert.match(sql, /function public\.record_itinerary_touch\(\s*p_list_id\s+uuid,\s*p_venue_id uuid default null\s*\) returns void/);
  assert.match(body, /v_uid\s+uuid := auth\.uid\(\)/);
  assert.match(body, /raise exception 'authentication required'/);
  assert.match(body, /select l\.user_id into v_owner/, "Insider is derived from the list owner");
  assert.match(body, /v_owner = v_uid/, "no self-credit");
  assert.match(body, /from public\.user_list_items i/, "only venues actually in the list");
  assert.match(sql, /revoke all on function public\.record_itinerary_touch\(uuid, uuid\) from public, anon/);
});

test("repeat views in a day are one touch", () => {
  assert.match(sql, /create unique index if not exists super_user_venue_touches_daily_uidx/);
  assert.match(sql, /\(\(created_at at time zone 'utc'\)::date\)/);
});

test("row-level presence data is admin-only; definer functions pin search_path", () => {
  const policies = sql.match(/using \(\(select public\.is_happitime_admin\(\)\)\)/g) ?? [];
  assert.equal(policies.length, 2, "one admin-only select policy per table");
  assert.doesNotMatch(sql, /super_user_id = \(?\s*(select )?auth\.uid\(\)/, "Insiders do not read other users' rows");
  const definers = sql.match(/security definer\s+set search_path = public/g) ?? [];
  assert.equal(definers.length, 3);
  const invokers = sql.match(/security_invoker = on/g) ?? [];
  assert.equal(invokers.length, 2, "both views run as the caller");
});

test("the traffic view keeps its original columns, in order, and appends influence", () => {
  const view = sql.slice(sql.indexOf("create or replace view public.super_user_traffic_summary"));
  const order = [
    "as super_user_id",
    "as first_checkins_driven",
    "as venues_touched",
    "as redemptions_driven",
    "as influenced_checkins",
    "as influenced_new_faces",
    "as influenced_venues",
  ].map((c) => view.indexOf(c, view.indexOf("\nselect\n")));
  assert.ok(order.every((i) => i !== -1), "all seven columns present");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "CREATE OR REPLACE needs the old order kept");
  assert.match(view, /r\.referee_user_id = fv\.user_id/, "recruited-traffic columns unchanged");
  assert.match(view, /where a\.basis = 'venue_touch'/, "influence counts venue touches only");
});
