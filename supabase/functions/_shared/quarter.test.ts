// supabase/functions/_shared/quarter.test.ts
//
// Anti-drift test suite for the Deno calendar-quarter helper.
// Asserts the SAME four canonical cases as the Node suite
// (test/quarter.test.mjs), ensuring both implementations produce identical
// output.  A mismatch here means the .mjs and .ts impls have drifted —
// fix both to agree.
//
// Run: deno test --no-config supabase/functions/_shared/quarter.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { currentQuarter } from "./quarter.ts";

Deno.test("maps months to YYYY-Q#", () => {
  assertEquals(currentQuarter(new Date("2026-01-15T12:00:00Z")), "2026-Q1");
  assertEquals(currentQuarter(new Date("2026-04-01T12:00:00Z")), "2026-Q2");
  assertEquals(currentQuarter(new Date("2026-09-30T12:00:00Z")), "2026-Q3");
  assertEquals(currentQuarter(new Date("2026-12-31T12:00:00Z")), "2026-Q4");
});
