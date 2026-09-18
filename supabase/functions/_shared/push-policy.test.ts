// supabase/functions/_shared/push-policy.test.ts
//
// Run: deno test --no-config supabase/functions/_shared/push-policy.test.ts
//
// All instants are UTC. Chicago is UTC-5 in summer (CDT) and UTC-6 in
// winter (CST); DST ends Sun 2026-11-01 at 02:00 CDT -> 01:00 CST.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allowedPushCount,
  chicagoDayStart,
  DAILY_PUSH_CAP,
  isQuietHours,
  parseDailyCap,
  parseQuietHours,
  policyFromEnv,
  QUIET_END_HOUR,
  QUIET_START_HOUR,
} from "./push-policy.ts";

const iso = (d: Date) => d.toISOString();

Deno.test("quiet-hours boundaries in CDT (UTC-5)", () => {
  // Wed 2026-07-15 local evening -> Thu 07-16 UTC
  assertEquals(isQuietHours(new Date("2026-07-16T02:59:59Z")), false, "21:59:59 CDT");
  assertEquals(isQuietHours(new Date("2026-07-16T03:00:00Z")), true, "22:00 CDT");
  assertEquals(isQuietHours(new Date("2026-07-15T13:59:59Z")), true, "08:59:59 CDT");
  assertEquals(isQuietHours(new Date("2026-07-15T14:00:00Z")), false, "09:00 CDT");
  // deep inside each side
  assertEquals(isQuietHours(new Date("2026-07-16T07:00:00Z")), true, "02:00 CDT");
  assertEquals(isQuietHours(new Date("2026-07-15T22:00:00Z")), false, "17:00 CDT");
});

Deno.test("quiet-hours boundaries in CST (UTC-6)", () => {
  // Thu 2026-01-15 local evening -> Fri 01-16 UTC
  assertEquals(isQuietHours(new Date("2026-01-16T03:59:59Z")), false, "21:59:59 CST");
  assertEquals(isQuietHours(new Date("2026-01-16T04:00:00Z")), true, "22:00 CST");
  assertEquals(isQuietHours(new Date("2026-01-15T14:59:59Z")), true, "08:59:59 CST");
  assertEquals(isQuietHours(new Date("2026-01-15T15:00:00Z")), false, "09:00 CST");
});

Deno.test("quiet-hours honours custom windows, non-wrapping and disabled", () => {
  const noon = new Date("2026-07-15T17:00:00Z"); // 12:00 CDT
  assertEquals(isQuietHours(noon, "America/Chicago", 11, 13), true);
  assertEquals(isQuietHours(noon, "America/Chicago", 13, 15), false);
  assertEquals(isQuietHours(noon, "America/Chicago", 12, 12), false, "zero-length window");
  assertEquals(isQuietHours(noon, "America/Chicago", 0, 24 - 1), true, "0-23 covers noon");
  // other tz: 17:00Z is 18:00 in London (BST), quiet under 17-19
  assertEquals(isQuietHours(noon, "Europe/London", 17, 19), true);
});

Deno.test("chicagoDayStart in plain CDT and CST", () => {
  assertEquals(iso(chicagoDayStart(new Date("2026-07-15T17:00:00Z"))), "2026-07-15T05:00:00.000Z");
  // 2026-07-16T03:30Z is still 07-15 in Chicago (22:30 CDT)
  assertEquals(iso(chicagoDayStart(new Date("2026-07-16T03:30:00Z"))), "2026-07-15T05:00:00.000Z");
  assertEquals(iso(chicagoDayStart(new Date("2026-01-15T17:00:00Z"))), "2026-01-15T06:00:00.000Z");
  // 2026-01-16T05:30Z is 23:30 CST on 01-15
  assertEquals(iso(chicagoDayStart(new Date("2026-01-16T05:30:00Z"))), "2026-01-15T06:00:00.000Z");
});

Deno.test("chicagoDayStart across the November DST change", () => {
  // Sat Oct 31 (CDT): midnight = 05:00Z
  assertEquals(iso(chicagoDayStart(new Date("2026-10-31T18:00:00Z"))), "2026-10-31T05:00:00.000Z");
  // Sun Nov 1: midnight was still CDT (05:00Z) even though the day ends in CST
  const nov1Start = chicagoDayStart(new Date("2026-11-01T12:00:00Z")); // 06:00 CST
  assertEquals(iso(nov1Start), "2026-11-01T05:00:00.000Z");
  // both copies of the repeated 01:30 local hour belong to Nov 1
  assertEquals(iso(chicagoDayStart(new Date("2026-11-01T06:30:00Z"))), "2026-11-01T05:00:00.000Z", "1:30 CDT");
  assertEquals(iso(chicagoDayStart(new Date("2026-11-01T07:30:00Z"))), "2026-11-01T05:00:00.000Z", "1:30 CST");
  // Mon Nov 2 (CST): midnight = 06:00Z, and Nov 1 was a 25-hour day
  const nov2Start = chicagoDayStart(new Date("2026-11-02T18:00:00Z"));
  assertEquals(iso(nov2Start), "2026-11-02T06:00:00.000Z");
  assertEquals((nov2Start.getTime() - nov1Start.getTime()) / 3_600_000, 25);
  // and the March spring-forward day (Sun 2026-03-08) is 23 hours
  const mar8 = chicagoDayStart(new Date("2026-03-08T18:00:00Z"));
  const mar9 = chicagoDayStart(new Date("2026-03-09T18:00:00Z"));
  assertEquals(iso(mar8), "2026-03-08T06:00:00.000Z");
  assertEquals(iso(mar9), "2026-03-09T05:00:00.000Z");
  assertEquals((mar9.getTime() - mar8.getTime()) / 3_600_000, 23);
});

Deno.test("allowedPushCount clamps at zero and respects cap", () => {
  assertEquals(DAILY_PUSH_CAP, 4);
  assertEquals(allowedPushCount(0), 4);
  assertEquals(allowedPushCount(3), 1);
  assertEquals(allowedPushCount(4), 0);
  assertEquals(allowedPushCount(9), 0, "over cap never negative");
  assertEquals(allowedPushCount(-2), 4, "negative usage treated as zero");
  assertEquals(allowedPushCount(1, 10), 9);
  assertEquals(allowedPushCount(0, 0), 0, "cap 0 disables push");
  assertEquals(allowedPushCount(2.7, 4), 2, "fractional usage floors");
  assertEquals(allowedPushCount(NaN, 4), 4);
  assertEquals(allowedPushCount(0, NaN), 0);
});

Deno.test("parseQuietHours / parseDailyCap", () => {
  assertEquals(parseQuietHours("22-9"), { startHour: 22, endHour: 9 });
  assertEquals(parseQuietHours(" 22 - 09 "), { startHour: 22, endHour: 9 });
  assertEquals(parseQuietHours("OFF"), null);
  assertEquals(parseQuietHours("none"), null);
  assertEquals(parseQuietHours("22"), undefined);
  assertEquals(parseQuietHours("25-9"), undefined);
  assertEquals(parseQuietHours("banana"), undefined);
  assertEquals(parseQuietHours(""), undefined);
  assertEquals(parseQuietHours(undefined), undefined);
  assertEquals(parseDailyCap("4"), 4);
  assertEquals(parseDailyCap(" 12 "), 12);
  assertEquals(parseDailyCap("0"), 0);
  assertEquals(parseDailyCap("-1"), undefined);
  assertEquals(parseDailyCap("4.5"), undefined);
  assertEquals(parseDailyCap("lots"), undefined);
  assertEquals(parseDailyCap(undefined), undefined);
});

function fakeEnv(vars: Record<string, string | undefined>) {
  return { get: (k: string) => vars[k] };
}

Deno.test("policyFromEnv: defaults when unset", () => {
  const warnings: string[] = [];
  const p = policyFromEnv(fakeEnv({}), (m) => warnings.push(m));
  assertEquals(p.dailyCap, DAILY_PUSH_CAP);
  assertEquals(p.quiet, { startHour: QUIET_START_HOUR, endHour: QUIET_END_HOUR });
  assertEquals(p.tz, "America/Chicago");
  assertEquals(warnings, []);
});

Deno.test("policyFromEnv: valid overrides", () => {
  const warnings: string[] = [];
  const p = policyFromEnv(
    fakeEnv({ PUSH_DAILY_CAP: "7", PUSH_QUIET_HOURS: "23-8" }),
    (m) => warnings.push(m),
  );
  assertEquals(p.dailyCap, 7);
  assertEquals(p.quiet, { startHour: 23, endHour: 8 });
  assertEquals(warnings, []);
  const off = policyFromEnv(fakeEnv({ PUSH_QUIET_HOURS: "off" }), (m) => warnings.push(m));
  assertEquals(off.quiet, null);
  assertEquals(off.dailyCap, DAILY_PUSH_CAP);
  assertEquals(warnings, []);
});

Deno.test("policyFromEnv: malformed values warn and fall back", () => {
  const warnings: string[] = [];
  const p = policyFromEnv(
    fakeEnv({ PUSH_DAILY_CAP: "four", PUSH_QUIET_HOURS: "late-early" }),
    (m) => warnings.push(m),
  );
  assertEquals(p.dailyCap, DAILY_PUSH_CAP);
  assertEquals(p.quiet, { startHour: QUIET_START_HOUR, endHour: QUIET_END_HOUR });
  assertEquals(warnings.length, 2);
  assertEquals(warnings[0].includes("PUSH_DAILY_CAP"), true);
  assertEquals(warnings[1].includes("PUSH_QUIET_HOURS"), true);
});

Deno.test("policyFromEnv: does not mutate DEFAULT_POLICY", async () => {
  const mod = await import("./push-policy.ts");
  const p = policyFromEnv(fakeEnv({ PUSH_QUIET_HOURS: "1-2", PUSH_DAILY_CAP: "1" }));
  p.quiet!.startHour = 99;
  assertEquals(mod.DEFAULT_POLICY.quiet, { startHour: 22, endHour: 9 });
  assertEquals(mod.DEFAULT_POLICY.dailyCap, 4);
});
