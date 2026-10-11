// Which venue_events rows are still worth showing, and in what order.
//
// WHY THIS EXISTS (2026-10-10): every surface that listed a venue's events
// filtered on `status = 'published'` and nothing else. Nothing ever removed an
// event once it had happened, so the public venue page headed a list of
// June/July World Cup parties "Upcoming Events" in October, and series whose
// RRULE carried an UNTIL kept rendering as "Every Thu" weeks after they ended.
// First reported 2026-08-11 (VENUE-EVENTS-FIX-SPEC-2026-08-11.md, "Bug 1").
//
// Three facts about the data that this module encodes so call sites don't
// have to rediscover them:
//
//   1. A recurring row's `starts_at` is NOT its next occurrence. It is the
//      first occurrence (or the day the series was entered). Ordering by
//      `starts_at` therefore puts the oldest series first and buries a show
//      that is on tomorrow. Order by `nextOccurrence` instead.
//   2. A series ends in one of two ways: `UNTIL=` in the rule, or — an older
//      convention — an `ends_at` far from `starts_at`. An `ends_at` within a
//      day and a half of `starts_at` is the end of ONE occurrence ("7–10 PM").
//   3. Rule space actually present (counted 2026-10-10):
//        FREQ=WEEKLY;BYDAY=<MO..SU, comma-separated>[;UNTIL=...]
//        FREQ=MONTHLY;BYDAY=<nth><day>[,<nth><day>][;UNTIL=...]
//        FREQ=DAILY[;UNTIL=...]
//      Anything else (INTERVAL>1, BYMONTHDAY, free text) is "unknown": the
//      event stays listed, sorts last, and is never placed on a calendar day.
//
// Time-of-day is kept in the event's own timezone and converted back to an
// instant at the end, so a 7 PM Tuesday series stays 7 PM across DST.
//
// Plain ESM with no dependencies so `node --test` can exercise it directly.
// An identical copy lives in apps/mobile/src/lib/eventSchedule.mjs — the two
// apps do not share a runtime package for this. test/event-schedule.test.mjs
// fails if the copies drift. supabase/functions/_shared/recurrence.ts is the
// edge-function sibling (push notifications).

export const DEFAULT_TZ = "America/Chicago";

/** A one-off stays listed this long after it ends, so tonight's event survives to closing. */
export const ONE_OFF_GRACE_MS = 3 * 60 * 60 * 1000;

/** On a recurring row, an `ends_at` further than this from `starts_at` is the end of the SERIES. */
export const SERIES_SPAN_MS = 36 * 60 * 60 * 1000;

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDINALS = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", "-1": "Last" };

const fmtCache = new Map();
function fmt(tz) {
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

function zoneOf(event) {
  const tz = typeof event.timezone === "string" ? event.timezone.trim() : "";
  return tz || DEFAULT_TZ;
}

/** Wall-clock components of an instant, as seen in `tz`. */
export function localParts(instant, tz = DEFAULT_TZ) {
  const p = {};
  for (const part of fmt(tz).formatToParts(instant)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  // hourCycle h23 can still yield 24 for midnight in some engines.
  return { y: p.year, m: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, mi: p.minute, s: p.second };
}

/** Instant for a wall-clock time in `tz`. Two passes converge across a DST boundary. */
export function zonedToUtc(parts, tz = DEFAULT_TZ) {
  const target = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.mi, parts.s);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(guess), tz);
    const diff = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.mi, seen.s) - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/** Day of week (0 = Sunday) of a calendar date, independent of timezone. */
function dowOf(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar date shifted by `days`. UTC noon dodges DST. */
function shiftDate(y, m, d, days) {
  const t = new Date(Date.UTC(y, m - 1, d + days, 12));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

function toDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseUntil(rule) {
  const m = rule.match(/UNTIL=(\d{8})(?:T(\d{6}))?/);
  if (!m) return null;
  const d = m[1];
  // A date-only UNTIL means "through that day".
  const t = m[2] ?? "235959";
  const ms = Date.UTC(
    Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)),
    Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4, 6)),
  );
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/**
 * Parse the supported slice of RRULE. Returns null for anything this module
 * cannot place on a calendar — callers treat null as "unknown schedule".
 */
export function parseRule(rule) {
  const r = (rule ?? "").trim().toUpperCase();
  if (!r.startsWith("FREQ=")) return null;

  const fields = {};
  for (const pair of r.split(";")) {
    const eq = pair.indexOf("=");
    if (eq > 0) fields[pair.slice(0, eq)] = pair.slice(eq + 1);
  }

  const freq = fields.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  if (fields.INTERVAL && fields.INTERVAL !== "1") return null;
  if (fields.BYMONTHDAY || fields.BYMONTH || fields.BYSETPOS || fields.COUNT) return null;

  const byday = [];
  if (fields.BYDAY) {
    for (const tok of fields.BYDAY.split(",")) {
      const m = tok.trim().match(/^(-?\d)?(SU|MO|TU|WE|TH|FR|SA)$/);
      if (!m) return null;
      byday.push({ nth: m[1] ? Number(m[1]) : null, dow: DAY_CODES.indexOf(m[2]) });
    }
  }
  // "Second Thursday" needs a day to count; a bare MONTHLY has none here.
  if (freq === "MONTHLY" && byday.length === 0) return null;
  // A numbered day only means something monthly.
  if (freq !== "MONTHLY" && byday.some((b) => b.nth !== null)) return null;

  return { freq, byday, until: parseUntil(r) };
}

/** `ends_at` when it closes a single occurrence; null when absent or when it marks the series end. */
export function occurrenceEnd(event) {
  const start = toDate(event.starts_at);
  const end = toDate(event.ends_at);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  if (event.is_recurring && end.getTime() - start.getTime() > SERIES_SPAN_MS) return null;
  return end;
}

/** When a recurring series stops for good, or null if it is open-ended (or not a series). */
export function seriesEnd(event) {
  if (!event.is_recurring) return null;
  const ends = [];
  const until = parseUntil((event.recurrence_rule ?? "").toUpperCase());
  if (until) ends.push(until.getTime());
  const start = toDate(event.starts_at);
  const end = toDate(event.ends_at);
  if (start && end && end.getTime() - start.getTime() > SERIES_SPAN_MS) ends.push(end.getTime());
  return ends.length ? new Date(Math.min(...ends)) : null;
}

/** Does a calendar date satisfy the rule's day pattern? (Ignores start/end bounds.) */
function matchesPattern(parsed, startLocal, y, m, d) {
  if (parsed.freq === "DAILY") return true;
  const dow = dowOf(y, m, d);
  if (parsed.freq === "WEEKLY") {
    if (parsed.byday.length === 0) return dow === dowOf(startLocal.y, startLocal.m, startLocal.d);
    return parsed.byday.some((b) => b.dow === dow);
  }
  // MONTHLY
  const fromStart = Math.ceil(d / 7);
  const fromEnd = -Math.ceil((daysInMonth(y, m) - d + 1) / 7);
  return parsed.byday.some(
    (b) => b.dow === dow && (b.nth === null || b.nth === fromStart || b.nth === fromEnd),
  );
}

/**
 * First occurrence of the event at or after `from`, as an instant.
 *
 * Null when a one-off has already started, when a series has ended, or when
 * the rule is one this module cannot schedule.
 */
export function nextOccurrence(event, from = new Date()) {
  const start = toDate(event.starts_at);
  if (!start) return null;
  if (!event.is_recurring) return start.getTime() >= from.getTime() ? start : null;

  const parsed = parseRule(event.recurrence_rule);
  if (!parsed) return null;

  const tz = zoneOf(event);
  const end = seriesEnd(event);
  // A series cannot occur before its own first date.
  const floor = from.getTime() > start.getTime() ? from : start;
  if (end && floor.getTime() > end.getTime()) return null;

  const startLocal = localParts(start, tz);
  const floorLocal = localParts(floor, tz);
  const tod = { h: startLocal.h, mi: startLocal.mi, s: startLocal.s };

  // 62 days always spans two full calendar months, which is the longest gap
  // between occurrences any supported rule can have ("5th Friday").
  for (let i = 0; i <= 62; i++) {
    const [y, m, d] = shiftDate(floorLocal.y, floorLocal.m, floorLocal.d, i);
    if (!matchesPattern(parsed, startLocal, y, m, d)) continue;
    const candidate = zonedToUtc({ y, m, d, ...tod }, tz);
    if (candidate.getTime() < floor.getTime()) continue;
    return end && candidate.getTime() > end.getTime() ? null : candidate;
  }
  return null;
}

/**
 * Does the event happen on this calendar date (in the event's own timezone)?
 * `m` is 1-based. Used by "today's events" and the month calendar.
 */
export function occursOnLocalDate(event, y, m, d) {
  const start = toDate(event.starts_at);
  if (!start) return false;
  const tz = zoneOf(event);
  const startLocal = localParts(start, tz);

  if (!event.is_recurring) {
    return startLocal.y === y && startLocal.m === m && startLocal.d === d;
  }

  const parsed = parseRule(event.recurrence_rule);
  if (!parsed || !matchesPattern(parsed, startLocal, y, m, d)) return false;

  const occurrence = zonedToUtc({ y, m, d, h: startLocal.h, mi: startLocal.mi, s: startLocal.s }, tz);
  if (occurrence.getTime() < start.getTime()) return false;
  const end = seriesEnd(event);
  return !(end && occurrence.getTime() > end.getTime());
}

/**
 * Should this event still be listed?
 *
 * One-off: until ONE_OFF_GRACE_MS after it ends (or after it starts, when no
 * end is recorded). Series: until its end passes. A series whose rule cannot
 * be parsed is kept — hiding something we merely fail to understand is the
 * worse error.
 */
export function isEventLive(event, now = new Date()) {
  const start = toDate(event.starts_at);
  if (!start) return false;

  if (!event.is_recurring) {
    const end = occurrenceEnd(event) ?? start;
    return end.getTime() + ONE_OFF_GRACE_MS >= now.getTime();
  }

  const end = seriesEnd(event);
  if (end && end.getTime() < now.getTime()) return false;
  if (!parseRule(event.recurrence_rule)) return true;
  // Open series always have a next occurrence; a bounded one may have run out
  // of dates before its UNTIL.
  return nextOccurrence(event, new Date(now.getTime() - ONE_OFF_GRACE_MS)) !== null;
}

/**
 * Live events only, soonest first.
 *
 * Series sort by their next occurrence, not by `starts_at`. The sort looks
 * back by the grace window so a special that began an hour ago still sorts
 * as tonight rather than as next week. Series with an unknown rule go last.
 */
export function liveEventsSorted(events, now = new Date()) {
  const lookback = new Date(now.getTime() - ONE_OFF_GRACE_MS);
  return (events ?? [])
    .filter((e) => isEventLive(e, now))
    .map((e) => {
      const next = e.is_recurring ? nextOccurrence(e, lookback) : toDate(e.starts_at);
      return { e, key: next ? next.getTime() : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.key - b.key || String(a.e.title ?? "").localeCompare(String(b.e.title ?? "")))
    .map((x) => x.e);
}

/**
 * Human label for a recurrence rule: "Every Tue", "Every Sat, Sun", "Daily",
 * "2nd Thu of the month", "2nd & 4th Thu of the month". "Recurring" when the
 * rule is missing or not one this module understands.
 */
export function recurrenceLabel(rule) {
  const parsed = parseRule(rule);
  if (!parsed) return "Recurring";
  if (parsed.freq === "DAILY") return "Daily";

  if (parsed.freq === "WEEKLY") {
    if (parsed.byday.length === 0) return "Weekly";
    // Monday-first, the way a week is read aloud.
    const dows = [...new Set(parsed.byday.map((b) => b.dow))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (dows.length === 7) return "Daily";
    return `Every ${dows.map((d) => DAY_LABELS[d]).join(", ")}`;
  }

  const sameDay = parsed.byday.every((b) => b.dow === parsed.byday[0].dow);
  const ord = (b) => (b.nth === null ? "Every" : ORDINALS[b.nth] ?? `${b.nth}th`);
  if (sameDay) {
    return `${parsed.byday.map(ord).join(" & ")} ${DAY_LABELS[parsed.byday[0].dow]} of the month`;
  }
  return `${parsed.byday.map((b) => `${ord(b)} ${DAY_LABELS[b.dow]}`).join(" & ")} of the month`;
}
