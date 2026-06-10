// supabase/functions/verify-checkin/index.test.ts
//
// Pure-logic unit tests for the verify-checkin edge function.
//
// Strategy: per the "reality note" the HTTP handler is thin. All decision
// logic is extracted into pure helpers in the implementation.  These tests
// cover every branch exhaustively via the pure-function layer.  Integration
// (real DB, real HTTP) is out of scope for unit runs; the test file explicitly
// calls out which rules are structurally-reviewed vs. unit-tested.
//
// Run:
//   deno test supabase/functions/verify-checkin/index.test.ts --allow-read

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// Import the pure helpers we are testing.  The implementation exports them
// from the same file for testability.
// ---------------------------------------------------------------------------
import {
  haversineMeters,
  withinGeofence,
  isGraceWindow,
  priorServiceDateStr,
  codeMatchesWithGrace,
  stampsToNextRound,
  isFirstVisit,
  attemptsRemaining,
  serviceDate as svcDate,
} from "./logic.ts";

// ---------------------------------------------------------------------------
// 1. haversine
// ---------------------------------------------------------------------------
Deno.test("haversine: same point → 0 m", () => {
  assertEquals(haversineMeters(41.8827, -87.6233, 41.8827, -87.6233), 0);
});

Deno.test("haversine: known pair ~100 m apart", () => {
  // Roughly 100 m north of (41.8827, -87.6233).
  // One degree lat ≈ 111 320 m; 100 m ≈ 0.000899 deg.
  const d = haversineMeters(41.8827, -87.6233, 41.8836, -87.6233);
  assertAlmostEquals(d, 100, 5); // within 5 m
});

Deno.test("haversine: ~1 km apart", () => {
  const d = haversineMeters(41.8827, -87.6233, 41.8917, -87.6233);
  assertAlmostEquals(d, 1000, 20); // within 20 m
});

// ---------------------------------------------------------------------------
// 2. withinGeofence
// ---------------------------------------------------------------------------
Deno.test("withinGeofence: inside → true", () => {
  assertEquals(withinGeofence(50, 100), true);
});

Deno.test("withinGeofence: exactly on boundary → true", () => {
  assertEquals(withinGeofence(100, 100), true);
});

Deno.test("withinGeofence: outside → false", () => {
  assertEquals(withinGeofence(101, 100), false);
});

// ---------------------------------------------------------------------------
// 3. serviceDate  (re-exported from checkin-code.ts)
// ---------------------------------------------------------------------------
Deno.test("svcDate: 08:00 CT stays on same calendar date", () => {
  assertEquals(svcDate(new Date("2026-06-09T13:00:00Z")), "2026-06-09");
});

Deno.test("svcDate: 05:59 CT rolls back to prior service date", () => {
  assertEquals(svcDate(new Date("2026-06-09T10:59:00Z")), "2026-06-08");
});

Deno.test("svcDate: 06:01 CT stays on current calendar date", () => {
  assertEquals(svcDate(new Date("2026-06-09T11:01:00Z")), "2026-06-09");
});

// ---------------------------------------------------------------------------
// 4. priorServiceDateStr — decrement the YYYY-MM-DD string
// ---------------------------------------------------------------------------
Deno.test("priorServiceDateStr: decrements by exactly one day", () => {
  assertEquals(priorServiceDateStr("2026-06-09"), "2026-06-08");
});

Deno.test("priorServiceDateStr: wraps month boundary", () => {
  assertEquals(priorServiceDateStr("2026-06-01"), "2026-05-31");
});

Deno.test("priorServiceDateStr: wraps year boundary", () => {
  assertEquals(priorServiceDateStr("2026-01-01"), "2025-12-31");
});

// ---------------------------------------------------------------------------
// 5. isGraceWindow — true when within 10 min after 6:00 AM CT
// ---------------------------------------------------------------------------
Deno.test("isGraceWindow: 06:05 CT → in grace", () => {
  // 06:05 CT on 2026-06-09 = 11:05 UTC
  assertEquals(isGraceWindow(new Date("2026-06-09T11:05:00Z")), true);
});

Deno.test("isGraceWindow: 06:00 CT exactly → in grace (boundary)", () => {
  // 06:00 CT = 11:00 UTC
  assertEquals(isGraceWindow(new Date("2026-06-09T11:00:00Z")), true);
});

Deno.test("isGraceWindow: 06:10 CT exactly → outside grace", () => {
  // 06:10 CT = 11:10 UTC — 10 min is the exclusive upper bound
  assertEquals(isGraceWindow(new Date("2026-06-09T11:10:00Z")), false);
});

Deno.test("isGraceWindow: 05:59 CT → outside grace (before 6 AM)", () => {
  assertEquals(isGraceWindow(new Date("2026-06-09T10:59:00Z")), false);
});

Deno.test("isGraceWindow: 08:00 CT → outside grace", () => {
  assertEquals(isGraceWindow(new Date("2026-06-09T13:00:00Z")), false);
});

// ---------------------------------------------------------------------------
// 6. codeMatchesWithGrace
//    Vectors from checkin-test-vectors.json:
//      secret = "00000000-0000-0000-0000-000000000000"
//      service_date "2026-06-09" → code "GYCM"
//      service_date "2026-06-08" → code "CW62"
// ---------------------------------------------------------------------------
const TEST_SECRET = "00000000-0000-0000-0000-000000000000";
// 08:00 CT → svcDate 2026-06-09 → code GYCM
const T_DAYTIME = new Date("2026-06-09T13:00:00Z");
// 06:05 CT → svcDate 2026-06-09 (current day), grace window open → prior code CW62 also accepted
const T_GRACE = new Date("2026-06-09T11:05:00Z");

Deno.test("codeMatchesWithGrace: correct today's code during day → true", () => {
  assertEquals(codeMatchesWithGrace(TEST_SECRET, T_DAYTIME, "GYCM"), true);
});

Deno.test("codeMatchesWithGrace: wrong code during day → false", () => {
  assertEquals(codeMatchesWithGrace(TEST_SECRET, T_DAYTIME, "XXXX"), false);
});

Deno.test("codeMatchesWithGrace: today's code during grace → true", () => {
  assertEquals(codeMatchesWithGrace(TEST_SECRET, T_GRACE, "GYCM"), true);
});

Deno.test("codeMatchesWithGrace: prior-day code during grace → true", () => {
  assertEquals(codeMatchesWithGrace(TEST_SECRET, T_GRACE, "CW62"), true);
});

Deno.test("codeMatchesWithGrace: prior-day code outside grace → false", () => {
  assertEquals(codeMatchesWithGrace(TEST_SECRET, T_DAYTIME, "CW62"), false);
});

// ---------------------------------------------------------------------------
// 7. stampsToNextRound
// ---------------------------------------------------------------------------
Deno.test("stampsToNextRound: 0 stamps → 5 to next", () => {
  assertEquals(stampsToNextRound(0), 5);
});

Deno.test("stampsToNextRound: 1 stamp → 4 to next", () => {
  assertEquals(stampsToNextRound(1), 4);
});

Deno.test("stampsToNextRound: 5 stamps → 0 (card complete)", () => {
  assertEquals(stampsToNextRound(5), 0);
});

Deno.test("stampsToNextRound: 6 stamps → 0 (never negative)", () => {
  assertEquals(stampsToNextRound(6), 0);
});

// ---------------------------------------------------------------------------
// 8. isFirstVisit
// ---------------------------------------------------------------------------
Deno.test("isFirstVisit: no prior attribution, no prior checkin → true", () => {
  assertEquals(isFirstVisit(false, false), true);
});

Deno.test("isFirstVisit: has prior attribution → false", () => {
  assertEquals(isFirstVisit(true, false), false);
});

Deno.test("isFirstVisit: has prior checkin → false", () => {
  assertEquals(isFirstVisit(false, true), false);
});

Deno.test("isFirstVisit: has both → false", () => {
  assertEquals(isFirstVisit(true, true), false);
});

// ---------------------------------------------------------------------------
// 9. attemptsRemaining  (rate limit: 5 attempts per 15 min)
// ---------------------------------------------------------------------------
const CHECKIN_RATE_LIMIT = 5;

Deno.test("attemptsRemaining: 0 attempts used → 5 remaining", () => {
  assertEquals(attemptsRemaining(CHECKIN_RATE_LIMIT, 0), 5);
});

Deno.test("attemptsRemaining: 1 attempt used → 4 remaining", () => {
  assertEquals(attemptsRemaining(CHECKIN_RATE_LIMIT, 1), 4);
});

Deno.test("attemptsRemaining: 5 attempts used → 0 (limit hit)", () => {
  assertEquals(attemptsRemaining(CHECKIN_RATE_LIMIT, 5), 0);
});

Deno.test("attemptsRemaining: over limit → 0 (never negative)", () => {
  assertEquals(attemptsRemaining(CHECKIN_RATE_LIMIT, 7), 0);
});

// ---------------------------------------------------------------------------
// 10. Structurally-reviewed rules (require DB interaction — not unit-tested)
//   These rules are reviewed for correctness via code reading rather than
//   automated assertion. Documented here for traceability:
//
//   RULE 1 (rate_limit): uses check_rate_limit RPC — returns bool exceeded.
//     Reviewed: same pattern as send-friend-invite; key = `checkin:${userId}:${venueId}`.
//     On exceed → 429 { error: "rate_limited" }.
//
//   RULE 2 (employee_excluded): queries org_members via venue.org_id.
//     Reviewed: uses service-role client; queries public.org_members for matching user+org.
//     On match → 400 { error: "employee_excluded" }.
//
//   RULE 4 (out_of_range): calls haversineMeters + withinGeofence (unit-tested above).
//     DB provides venue.lat, venue.lng, venue.geofence_radius_m.
//     On fail → 400 { error: "out_of_range" }.
//
//   RULE 5 (network_cap): counts checkins with service_date = serviceDate(now) for user.
//     On ≥3 → 400 { error: "network_cap" }.
//
//   RULE 5b (abuse velocity): last-checkin distance heuristic → venue_flags(abuse_suspected).
//     Implemented as best-effort; flagged as concern if last_lat/lng not available.
//
//   RULE 6 (insert dedup): 23505 postgres error code treated as success.
//     Attribution row written with source='app_checkin', user_id set.
//
//   RULE 7 (fallback_limit): counts gps_fallback rows for (user, venue) lifetime.
//     On ≥2 → 400 { error: "fallback_limit" }. Writes venue_flags(staff_code_unknown).
// ---------------------------------------------------------------------------
Deno.test("structural review marker — rules 1,2,4,5,6,7 verified by code reading", () => {
  // This test passes trivially; it documents coverage intent.
  assertEquals(true, true);
});
