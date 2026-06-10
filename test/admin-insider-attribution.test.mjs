import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync(new URL("../apps/web/src/app/admin/users/page.tsx", import.meta.url), "utf8");
const traffic = readFileSync(new URL("../supabase/migrations/20260610210000_super_user_traffic_summary.sql", import.meta.url), "utf8");

test("admin users page reads the referral summary view", () => {
  assert.match(page, /super_user_referral_summary/);
});
test("admin users page guards the traffic summary read", () => {
  assert.match(page, /super_user_traffic_summary/);
});
test("traffic view (now active migration) references Phase 1 tables and credits referrers", () => {
  assert.match(traffic, /public\.checkins/);
  assert.match(traffic, /public\.round_redemptions/);
  assert.match(traffic, /r\.referee_user_id = fv\.user_id/);
});
