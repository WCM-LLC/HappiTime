import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20260610220000_toastmaker.sql", import.meta.url), "utf8");

test("does NOT recreate user_referrals (exists from Phase 5)", () => {
  assert.doesNotMatch(sql, /create table[^;]*public\.user_referrals/i);
  assert.doesNotMatch(sql, /create policy "user_referrals_select_related"/);
});
test("venue_toastmakers: world-readable for authenticated, unique per (venue, quarter), no client write", () => {
  assert.match(sql, /unique \(venue_id, quarter\)/);
  assert.match(sql, /venue_toastmakers_select_all"[\s\S]*for select to authenticated using \(true\)/);
  assert.doesNotMatch(sql, /for insert[\s\S]*venue_toastmakers/i);
});
test("scores view: weights = redemptions*3 + own_checkins*1, eligible floor 6 own AND 3 first-visits", () => {
  assert.match(sql, /attributed_redemptions,0\)\*3 \+ coalesce\(o\.own_checkins,0\)\*1 as score/);
  assert.match(sql, /own_checkins,0\) >= 6 and coalesce\(f\.attributed_first_visits,0\) >= 3/);
});
test("ratify + nominee are org-gated SECURITY DEFINER", () => {
  assert.match(sql, /function public\.ratify_toastmaker[\s\S]*security definer/);
  assert.match(sql, /raise exception 'not authorized'/);
  assert.match(sql, /function public\.toastmaker_nominee[\s\S]*security definer/);
});
