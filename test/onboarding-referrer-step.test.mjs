import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const mig = readFileSync(new URL("../supabase/migrations/20260610074000_onboarding_step_referrer.sql", import.meta.url), "utf8");
const consts = readFileSync(new URL("../apps/mobile/src/onboarding/state.ts", import.meta.url), "utf8");

test("constraint admits the new referrer step", () => {
  assert.match(mig, /'profile','referrer','complete'/);
});
test("ONBOARDING_STEPS includes referrer before complete", () => {
  assert.match(consts, /"referrer"|'referrer'/);
});
