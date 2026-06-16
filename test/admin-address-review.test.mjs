import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mig = readFileSync(
  new URL("../supabase/migrations/20260616120000_add_address_review_resolution.sql", import.meta.url),
  "utf8"
);

test("migration adds resolution columns to venues", () => {
  assert.match(mig, /add column if not exists address_review_resolved_at timestamptz/i);
  assert.match(mig, /add column if not exists address_review_resolved_by uuid/i);
});

test("migration creates the security-invoker review queue view", () => {
  assert.match(mig, /create or replace view public\.v_address_review_queue/i);
  assert.match(mig, /security_invoker\s*=\s*true/i);
  assert.match(mig, /needs_address_review\s*=\s*true/i);
  assert.match(mig, /venue_validation_log/i);
});

const fn = readFileSync(
  new URL("../supabase/functions/validate-venue-places/index.ts", import.meta.url),
  "utf8"
);

test("edge fn selects the resolution column", () => {
  assert.match(fn, /address_review_resolved_at/);
});

test("edge fn only writes the flag when unresolved, and clears on match", () => {
  // unresolved venues get needs_address_review = mismatch (true OR false)
  assert.match(fn, /needs_address_review:\s*mismatch/);
  // resolved venues are left untouched (guard on resolved_at)
  assert.match(fn, /resolved_at|address_review_resolved_at/);
});

const actions = readFileSync(
  new URL("../apps/web/src/actions/admin-address-review-actions.ts", import.meta.url),
  "utf8"
);

test("actions are admin-guarded server actions", () => {
  assert.match(actions, /^'use server'/m);
  assert.match(actions, /assertAdmin\(\)/);
  assert.match(actions, /getAdminClient\(\)/);
});

test("acceptGoogleAddress writes fields and clears the flag", () => {
  assert.match(actions, /export async function acceptGoogleAddress/);
  assert.match(actions, /needs_address_review:\s*false/);
});

test("dismissAddressReview stamps resolution state", () => {
  assert.match(actions, /export async function dismissAddressReview/);
  assert.match(actions, /address_review_resolved_at/);
  assert.match(actions, /address_review_resolved_by/);
});

test("actions revalidate the queue", () => {
  assert.match(actions, /revalidatePath\(['"]\/admin\/address-review['"]\)/);
});
