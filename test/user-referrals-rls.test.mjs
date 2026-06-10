import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20260610070000_user_referrals.sql", import.meta.url), "utf8");

test("user_referrals: select-only for related users, no client write policy", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select to authenticated[\s\S]*referee_user_id = auth\.uid\(\) or referrer_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(sql, /for insert[\s\S]*user_referrals/i); // writes via RPC only
});
test("record_referral is forge-proof: referee = auth.uid(), first-wins, no self-referral", () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /values \(auth\.uid\(\)/);                 // referee is the caller
  assert.match(sql, /on conflict \(referee_user_id\) do nothing/);
  assert.match(sql, /v_referrer = auth\.uid\(\) then return null/);
  assert.match(sql, /p_source not in \('share','code'\)/);    // 'invite' rejected
});
