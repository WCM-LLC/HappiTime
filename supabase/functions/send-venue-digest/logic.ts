// supabase/functions/send-venue-digest/logic.ts
//
// Pure decision helpers for the send-venue-digest edge function.
// Separated from the HTTP handler so unit tests can import without
// triggering Deno.serve (which requires --allow-net).
//
// All functions are stateless and have no side effects.

export { serviceDate } from "../_shared/checkin-code.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Subject formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the exact locked subject line format:
 *   "Today's HappiTime code: {CODE} · {N} check-ins yesterday"
 * The separator is U+00B7 MIDDLE DOT with one space on each side.
 * Count format is not pluralised (0 check-ins, 1 check-ins, N check-ins).
 */
export function formatDigestSubject(code: string, checkinCount: number): string {
  return `Today's HappiTime code: ${code} · ${checkinCount} check-ins yesterday`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 AM CT guard (DST-safe)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when `now` is within the 6:00 AM hour in America/Chicago
 * (i.e. hour === 6, minute 0–59).  Survives DST without cron edits:
 *   - Summer (CDT = UTC-5): 6am CT = 11:00 UTC
 *   - Winter (CST = UTC-6): 6am CT = 12:00 UTC
 * Both map to hour=6 in America/Chicago, so the cron fires at 00:00 UTC
 * every hour and this guard lets exactly one window through.
 */
export function isSixAmCentral(now: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  return h === 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zero-email self-check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the run sent zero emails but there is at least one active
 * (published) venue — a contractual reliability violation that must be alerted.
 *
 * NOTE: this should only be evaluated AFTER the 6am guard passes. Non-6am runs
 * legitimately send 0 emails (they exit early) and must NOT trigger this check.
 */
export function shouldAlertZeroSent(emailsSent: number, activeVenueCount: number): boolean {
  return emailsSent === 0 && activeVenueCount > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Yesterday's service-date window (for round_redemptions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the UTC [start, end) instants bounding yesterday's service date.
 * The service date flips at 6:00 AM America/Chicago, so:
 *   start = yesterday 06:00 CT expressed in UTC
 *   end   = today     06:00 CT expressed in UTC
 *
 * We compute by finding today's 6am CT in UTC (= the serviceDate flip instant),
 * then subtracting 24 h.  DST-safe because Intl.DateTimeFormat locates the
 * wall-clock 6am in the correct offset for each date.
 */
export function yesterdayServiceWindow(now: Date): { start: Date; end: Date } {
  // Find today's 6 AM CT as a UTC epoch.
  // Strategy: format now in CT to get YYYY-MM-DD, then build an Intl-resolved
  // timestamp for 06:00 that day in America/Chicago.
  const ctFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayCtStr = ctFormatter.format(now); // "YYYY-MM-DD"

  // Parse "today 06:00 CT" by binary search is overkill; use a robust approach:
  // create a Date from the ISO string with timezone offset inferred from CT.
  // We leverage the fact that `new Date(isoString)` interprets Z or +HH:MM.
  // Instead, we use the known-reliable method: shift the epoch.
  //
  // Find "today 06:00 CT" epoch = find the UTC moment when CT wall clock is
  // exactly todayCtStr 06:00:00.
  // We do this by constructing a UTC date for todayCtStr 06:00 and then
  // adjusting by the CT offset (from the Intl API on that constructed date).
  const todaySixAmUtcApprox = new Date(`${todayCtStr}T06:00:00Z`);

  // Get actual CT offset at that approximate moment (may be CDT or CST)
  const tzFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZoneName: "shortOffset",
  });
  const offsetStr = tzFmt.formatToParts(todaySixAmUtcApprox)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT-6";
  // offsetStr is like "GMT-5" (CDT) or "GMT-6" (CST)
  const offsetMatch = offsetStr.match(/GMT([+-]\d+)/);
  const ctOffsetHours = offsetMatch ? parseInt(offsetMatch[1], 10) : -6;

  // today 06:00 CT in UTC = 06:00 UTC - ctOffset = (6 - ctOffset) UTC
  const todaySixAmUtc = new Date(`${todayCtStr}T${String(6 - ctOffsetHours).padStart(2, "0")}:00:00Z`);

  // yesterday 06:00 CT = todaySixAmUtc - 24h (DST-safe: clock-day boundary is irrelevant)
  const yesterdaySixAmUtc = new Date(todaySixAmUtc.getTime() - 24 * 3600_000);

  return { start: yesterdaySixAmUtc, end: todaySixAmUtc };
}
