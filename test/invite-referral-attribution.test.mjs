import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20260610221000_invite_referral_attribution.sql", import.meta.url), "utf8");

test("handle_new_user records an 'invite' referral, first-wins, preserving existing logic", () => {
  assert.match(sql, /create or replace function public\.handle_new_user/i);
  assert.match(sql, /insert into public\.user_referrals[\s\S]*'invite'/i);
  assert.match(sql, /on conflict \(referee_user_id\) do nothing/i);
  // preserved existing behavior:
  assert.match(sql, /pending_friend_invites/i);   // still claims invites
  assert.match(sql, /user_follows/i);              // still creates mutual follows
  assert.match(sql, /user_profiles/i);             // still seeds the profile
});
