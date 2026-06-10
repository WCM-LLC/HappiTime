import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20260610072000_super_user_referral_summary.sql", import.meta.url), "utf8");

test("referral summary aggregates referees + itinerary_saves per super_user, no checkin dep", () => {
  assert.match(sql, /create or replace view public\.super_user_referral_summary/);
  assert.match(sql, /referrer_user_id as super_user_id, count\(\*\)::int as referees/);
  assert.match(sql, /kind = 'itinerary_save'/);
  assert.doesNotMatch(sql, /public\.checkins/);          // must not depend on Phase 1
  assert.doesNotMatch(sql, /round_redemptions/);
});
