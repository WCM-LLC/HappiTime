// test/quarter.test.mjs
//
// Test suite for the shared currentQuarter helper.
// Mirrors the Deno suite at supabase/functions/_shared/quarter.test.ts —
// both import from their respective implementation files so any divergence
// between the Node and Deno impls fails here automatically.

import test from "node:test";
import assert from "node:assert/strict";
import { currentQuarter } from "../packages/shared-api/src/checkin/quarter.mjs";

test("maps months to YYYY-Q#", () => {
  assert.equal(currentQuarter(new Date("2026-01-15T12:00:00Z")), "2026-Q1");
  assert.equal(currentQuarter(new Date("2026-04-01T12:00:00Z")), "2026-Q2");
  assert.equal(currentQuarter(new Date("2026-09-30T12:00:00Z")), "2026-Q3");
  assert.equal(currentQuarter(new Date("2026-12-31T12:00:00Z")), "2026-Q4");
});
