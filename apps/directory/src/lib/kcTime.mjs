// Kansas City wall-clock helpers.
//
// HappiTime is a Kansas City directory: "open now", "today's hours" and
// "today's events" all mean *in Kansas City*, never in whatever timezone the
// visitor happens to be sitting in. Using the visitor's clock silently shows
// the wrong day to anyone outside Central time — and shows the wrong day to
// everyone during the hours either side of midnight.
//
// Plain ESM so `node --test` can exercise it directly; the TypeScript signature
// lives in kcTime.d.ts.

export const KC_TZ = "America/Chicago";

/**
 * A Date whose *local* calendar fields mirror Kansas City's wall clock.
 *
 * The returned Date does not represent the same instant as `reference` — that
 * is the point. It is a carrier so existing `.getDay()` / `.getHours()` callers
 * read KC time without every call site having to learn about timezones.
 *
 * Built from Intl parts rather than parsing `toLocaleString`, whose output
 * format is not guaranteed to be re-parseable.
 */
export function kcNow(reference = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(reference);

  const v = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Some ICU builds emit hour "24" for midnight when hour12 is false.
  return new Date(v("year"), v("month") - 1, v("day"), v("hour") % 24, v("minute"), v("second"));
}

/** Kansas City day-of-week (0=Sun) and minutes past midnight. */
export function kcNowParts(reference = new Date()) {
  const d = kcNow(reference);
  return { dow: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
}

/** "5:47 PM" from minutes past midnight. */
export function formatClock(minutes) {
  const h24 = Math.floor(minutes / 60) % 24;
  const h = h24 % 12 || 12;
  return `${h}:${String(minutes % 60).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

// ---------------------------------------------------------------------------
// Event timestamp formatting
//
// `venue_events.starts_at` / `ends_at` are `timestamptz` — an instant, not a
// wall clock. Formatting one with a bare `toLocaleTimeString()` uses the
// *runtime's* zone, which on Vercel is UTC: a 12:00 PM CT event renders as
// "5:00 PM", and anything after 7:00 PM CT rolls onto the next calendar day.
// That shipped to production and put wrong times on every venue page.
//
// These helpers exist so no call site ever has to remember the `timeZone`
// option. Always format event timestamps through them. Pass the event's own
// `timezone` column when you have it; KC is only the fallback.
// Guarded by test/event-time-timezone.test.mjs.

/** "Sun, Aug 16" in the event's zone. */
export function formatEventDate(iso, timeZone = KC_TZ) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "3:00 PM" in the event's zone. */
export function formatEventTime(iso, timeZone = KC_TZ) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3:00 PM – 9:00 PM", or just the start when there is no end. */
export function formatEventTimeRange(startIso, endIso, timeZone = KC_TZ) {
  const start = formatEventTime(startIso, timeZone);
  return endIso ? `${start} – ${formatEventTime(endIso, timeZone)}` : start;
}
