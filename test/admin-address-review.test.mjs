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
