// supabase/functions/_shared/recurrence.ts
//
// Expands a venue_events row's recurrence_rule into its next occurrence.
//
// WHY THIS EXISTS (2026-09-14): 109 published venue_events rows carry an
// RRULE, but starts_at holds the date the series was ENTERED, not its next
// occurrence. Anything filtering on starts_at therefore never sees recurring
// events. notify-upcoming-events was the worst case — every recurring series
// got zero push notifications, ever.
//
// Rule space actually present in the DB (counted 2026-09-14). The parser
// covers exactly this and treats anything else as a one-off:
//   FREQ=WEEKLY;BYDAY=<MO|TU|WE|TH|FR|SA|SU, comma-separated>   105 rows
//   FREQ=DAILY;UNTIL=<YYYYMMDDTHHMMSSZ>                           2 rows
//   FREQ=MONTHLY;BYDAY=2TH                                        1 row
//
// Time-of-day is preserved in the venue's LOCAL timezone and converted back
// to an instant at the end, so a 7pm Tuesday series stays 7pm across the
// November DST change. Same bug class as VENUE-EVENTS-TZ-FIX-2026-08-16.md.
//
// Mirrors the SQL function proposed in
// My Assistant/drafts/2026-09-14_PROPOSED_MIGRATION_event_recurrence_expansion.sql
// — keep the two in agreement.
//
// No dependencies; runs in Deno edge functions and Node.

export const DEFAULT_TZ = "America/Chicago";

// JS getDay() convention: Sunday = 0.
const BYDAY_TO_DOW: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Wall-clock components of an instant, as seen in `tz`. */
export function localParts(instant: Date, tz: string): Parts {
  const p: Record<string, number> = {};
  for (const part of fmt(tz).formatToParts(instant)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  // hourCycle h23 can still yield 24 in some engines for midnight
  const h = p.hour === 24 ? 0 : p.hour;
  return { y: p.year, m: p.month, d: p.day, h, mi: p.minute, s: p.second };
}

/** Instant for a wall-clock time in `tz`. Two-pass offset correction handles DST. */
export function zonedToUtc(parts: Parts, tz: string): Date {
  // `target` is the wall clock we want, expressed as if it were UTC.
  // Each pass measures how far the guess's wall clock (in tz) is from
  // target and shifts the guess by that amount. Two passes converge
  // across a DST boundary.
  const target = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.mi, parts.s);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(guess), tz);
    const seenAsUtc = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.mi, seen.s);
    const diff = seenAsUtc - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/** Day of week (0 = Sunday) of a calendar date, independent of timezone. */
function dowOf(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Calendar date shifted by `days`, as (y, m, d). Uses UTC noon to dodge DST. */
function shiftDate(y: number, m: number, d: number, days: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d + days, 12));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

function parseUntil(rule: string): Date | null {
  const m = rule.match(/UNTIL=(\d{8})(?:T(\d{6}))?Z?/);
  if (!m) return null;
  const d = m[1], t = m[2] ?? "000000";
  const instant = Date.UTC(
    Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)),
    Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4, 6)),
  );
  return Number.isFinite(instant) ? new Date(instant) : null;
}

function parseByDay(rule: string): string[] {
  const m = rule.match(/BYDAY=([^;]+)/);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * First occurrence of the event at or after `from`.
 *
 * Returns null when the series has ended (UNTIL passed) or a one-off has
 * already happened. Rules that are not a recognisable RRULE are treated as
 * one-offs — e.g. the free-text 'Recurring Thursday series' row.
 */
export function nextOccurrence(
  startsAt: string | Date,
  rule: string | null | undefined,
  from: Date = new Date(),
  tz: string = DEFAULT_TZ,
): Date | null {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const zone = tz && tz.trim() ? tz.trim() : DEFAULT_TZ;

  const r = (rule ?? "").trim().toUpperCase();
  const oneOff = () => (start.getTime() >= from.getTime() ? start : null);
  if (!r.startsWith("FREQ=")) return oneOff();

  const until = parseUntil(r);
  if (until && from.getTime() > until.getTime()) return null;

  const freq = r.slice(5).split(";")[0];
  const startLocal = localParts(start, zone);
  const fromLocal = localParts(from, zone);
  const tod = { h: startLocal.h, mi: startLocal.mi, s: startLocal.s };

  const candidateAt = (y: number, m: number, d: number): Date =>
    zonedToUtc({ y, m, d, ...tod }, zone);

  if (freq === "DAILY") {
    for (let i = 0; i <= 1; i++) {
      const [y, m, d] = shiftDate(fromLocal.y, fromLocal.m, fromLocal.d, i);
      const c = candidateAt(y, m, d);
      if (c.getTime() >= from.getTime()) return until && c > until ? null : c;
    }
    return null;
  }

  if (freq === "WEEKLY") {
    let dows = parseByDay(r).map((t) => BYDAY_TO_DOW[t]).filter((n) => n !== undefined);
    if (dows.length === 0) dows = [dowOf(startLocal.y, startLocal.m, startLocal.d)];
    for (let i = 0; i <= 7; i++) {
      const [y, m, d] = shiftDate(fromLocal.y, fromLocal.m, fromLocal.d, i);
      if (!dows.includes(dowOf(y, m, d))) continue;
      const c = candidateAt(y, m, d);
      if (c.getTime() >= from.getTime()) return until && c > until ? null : c;
    }
    return null;
  }

  if (freq === "MONTHLY") {
    // BYDAY=2TH -> second Thursday of the month
    const tok = parseByDay(r)[0];
    if (!tok) return oneOff();
    const nth = Number(tok.replace(/\D/g, "")) || 1;
    const dow = BYDAY_TO_DOW[tok.slice(-2)];
    if (dow === undefined) return null;
    for (let mo = 0; mo <= 1; mo++) {
      const first = new Date(Date.UTC(fromLocal.y, fromLocal.m - 1 + mo, 1, 12));
      const y = first.getUTCFullYear(), m = first.getUTCMonth() + 1;
      const offset = (dow - dowOf(y, m, 1) + 7) % 7;
      const d = 1 + offset + (nth - 1) * 7;
      const [cy, cm, cd] = shiftDate(y, m, 1, d - 1);
      if (cm !== m) continue; // nth weekday does not exist this month
      const c = candidateAt(cy, cm, cd);
      if (c.getTime() >= from.getTime()) return until && c > until ? null : c;
    }
    return null;
  }

  return oneOff();
}
