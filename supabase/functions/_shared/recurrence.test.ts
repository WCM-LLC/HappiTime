// supabase/functions/_shared/recurrence.test.ts
//
// Run: deno test --no-config supabase/functions/_shared/recurrence.test.ts
//
// Cases mirror the 2026-09-14 production rule space plus the DST boundary.
// All expected values are UTC instants; comments give the Central wall clock.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextOccurrence } from "./recurrence.ts";

const TZ = "America/Chicago";
const iso = (d: Date | null) => (d ? d.toISOString() : null);

Deno.test("one-off in the future is returned as-is; in the past is null", () => {
  const from = new Date("2026-09-14T20:00:00Z");
  assertEquals(iso(nextOccurrence("2026-09-20T23:00:00Z", null, from, TZ)), "2026-09-20T23:00:00.000Z");
  assertEquals(nextOccurrence("2026-09-01T23:00:00Z", null, from, TZ), null);
});

Deno.test("free-text rule is treated as a one-off, not a crash", () => {
  const from = new Date("2026-09-14T20:00:00Z");
  assertEquals(nextOccurrence("2026-08-06T23:00:00Z", "Recurring Thursday series", from, TZ), null);
});

Deno.test("WEEKLY;BYDAY=TU entered in June lands on the next Tuesday, same local time", () => {
  // Taco Tuesday, entered Tue 2026-06-02 11:00 CDT (16:00Z).
  // From Mon 2026-09-14 15:00 CDT -> Tue 2026-09-15 11:00 CDT = 16:00Z.
  const from = new Date("2026-09-14T20:00:00Z");
  assertEquals(
    iso(nextOccurrence("2026-06-02T16:00:00Z", "FREQ=WEEKLY;BYDAY=TU", from, TZ)),
    "2026-09-15T16:00:00.000Z",
  );
});

Deno.test("same day, later time -> today; same day, earlier time -> next week", () => {
  // Series at Tue 17:00 CDT. From Tue 2026-09-15 15:00 CDT -> today 17:00 CDT (22:00Z).
  const early = new Date("2026-09-15T20:00:00Z");
  assertEquals(
    iso(nextOccurrence("2026-05-12T22:00:00Z", "FREQ=WEEKLY;BYDAY=TU", early, TZ)),
    "2026-09-15T22:00:00.000Z",
  );
  // From Tue 2026-09-15 18:00 CDT (after it started) -> next Tue 2026-09-22.
  const late = new Date("2026-09-15T23:00:00Z");
  assertEquals(
    iso(nextOccurrence("2026-05-12T22:00:00Z", "FREQ=WEEKLY;BYDAY=TU", late, TZ)),
    "2026-09-22T22:00:00.000Z",
  );
});

Deno.test("multi-day BYDAY picks the nearest listed day", () => {
  // $12 Lunch Menu TU,WE,TH,FR at 11:00 CDT. From Sat 2026-09-19 -> Tue 2026-09-22 11:00 CDT.
  const from = new Date("2026-09-19T20:00:00Z");
  assertEquals(
    iso(nextOccurrence("2026-08-18T16:00:00Z", "FREQ=WEEKLY;BYDAY=TU,WE,TH,FR", from, TZ)),
    "2026-09-22T16:00:00.000Z",
  );
});

Deno.test("DST: a 19:00 Central series stays 19:00 Central across the November change", () => {
  // Series entered in CDT (UTC-5): Tue 2026-10-27 19:00 CDT = 2026-10-28T00:00Z.
  // Next Tuesday after the Nov 1 change is CST (UTC-6): 19:00 CST = 2026-11-04T01:00Z.
  const from = new Date("2026-11-02T18:00:00Z");
  assertEquals(
    iso(nextOccurrence("2026-10-28T00:00:00Z", "FREQ=WEEKLY;BYDAY=TU", from, TZ)),
    "2026-11-04T01:00:00.000Z",
  );
});

Deno.test("DAILY;UNTIL stops after the UNTIL instant", () => {
  const rule = "FREQ=DAILY;UNTIL=20260801T065959Z";
  const before = new Date("2026-07-30T12:00:00Z");
  const after = new Date("2026-08-02T12:00:00Z");
  assertEquals(iso(nextOccurrence("2026-07-01T22:00:00Z", rule, before, TZ)), "2026-07-30T22:00:00.000Z");
  assertEquals(nextOccurrence("2026-07-01T22:00:00Z", rule, after, TZ), null);
});

Deno.test("MONTHLY;BYDAY=2TH -> second Thursday", () => {
  // From Mon 2026-09-14 -> 2nd Thursday of Sept is the 10th (past) -> Oct 8 2026, 19:00 CDT = 2026-10-09T00:00Z.
  const from = new Date("2026-09-14T20:00:00Z");
  assertEquals(
    iso(nextOccurrence("2026-09-11T00:00:00Z", "FREQ=MONTHLY;BYDAY=2TH", from, TZ)),
    "2026-10-09T00:00:00.000Z",
  );
});
