import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../supabase/migrations/20260610071000_super_user_credit_events.sql", import.meta.url), "utf8");

test("ledger: idempotent, never self-credit, select-own-or-admin, no client write", () => {
  assert.match(sql, /unique \(actor_user_id, subject_id\)/);
  assert.match(sql, /check \(super_user_id <> actor_user_id\)/);
  assert.match(sql, /super_user_id = auth\.uid\(\) or public\.is_happitime_admin\(\)/);
  assert.doesNotMatch(sql, /for insert[\s\S]*super_user_credit_events/i);
});
test("copy_shared_itinerary credits the sharer when owner is a super_user, not self", () => {
  assert.match(sql, /v_src_owner <> v_uid/);
  assert.match(sql, /role = 'super_user'/);
  assert.match(sql, /'itinerary_save', v_src_id/);
  assert.match(sql, /on conflict \(actor_user_id, subject_id\) do nothing/);
});
