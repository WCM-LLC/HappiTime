// Past events must not be listed, and live ones must be in next-occurrence order.
//
// WHY THIS FILE EXISTS
// --------------------
// On 2026-10-10 the public page for Dos Lokos headed this list "Upcoming
// Events": Ecuador in KC (Jun 19), two World Cup watch parties (July), a
// benefit night (Jul 25), Chiefs vs. Colts (Sep 20). 47 of the 89 live venues
// with events were showing at least one that had already happened, because
// every surface filtered on `status = 'published'` and nothing else, and
// nothing ever expired a row.
//
// The missing date filter was spec'd on 2026-08-11
// (VENUE-EVENTS-FIX-SPEC-2026-08-11.md, "Bug 1") and stayed open for two
// months. That document already says why: "Prose specs don't hold; land the
// test with the fix." This is that test.
//
// If you are here because it failed: do not add a date filter to one query and
// move on. The rule lives in lib/eventSchedule.mjs (one copy per app) and the
// nightly delete in supabase/migrations/*_expire_venue_events.sql mirrors it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const DIRECTORY_COPY = "apps/directory/src/lib/eventSchedule.mjs";
const MOBILE_COPY = "apps/mobile/src/lib/eventSchedule.mjs";

const {
  isEventLive,
  liveEventsSorted,
  nextOccurrence,
  occursOnLocalDate,
  occurrenceEnd,
  seriesEnd,
  recurrenceLabel,
  parseRule,
} = await import(join(root, DIRECTORY_COPY));

// Saturday 2026-10-10, 10:45 PM Central (CDT, UTC-5) — when the bug was found.
const NOW = new Date("2026-10-11T03:45:00Z");

const oneOff = (title, starts_at, ends_at = null) => ({
  title, starts_at, ends_at, is_recurring: false, recurrence_rule: null, timezone: "America/Chicago",
});
const series = (title, starts_at, recurrence_rule, ends_at = null) => ({
  title, starts_at, ends_at, is_recurring: true, recurrence_rule, timezone: "America/Chicago",
});

// --------------------------------------------------------------------------
// 1. What stays listed
// --------------------------------------------------------------------------

test("a one-off that has already happened is not live", () => {
  // The real rows that were on the Dos Lokos page.
  assert.equal(isEventLive(oneOff("Ecuador in KC", "2026-06-19T15:00:00Z", "2026-06-20T10:00:00Z"), NOW), false);
  assert.equal(isEventLive(oneOff("World Cup Final Watch", "2026-07-19T19:00:00Z"), NOW), false);
  assert.equal(isEventLive(oneOff("Chiefs vs. Colts", "2026-09-21T00:20:00Z"), NOW), false);
});

test("a one-off survives until three hours after it ends", () => {
  // Started 9 PM tonight, ends 1 AM: still on at 10:45 PM.
  const tonight = oneOff("Perdóname Festival", "2026-10-11T02:00:00Z", "2026-10-11T06:00:00Z");
  assert.equal(isEventLive(tonight, NOW), true);
  assert.equal(isEventLive(tonight, new Date("2026-10-11T08:59:00Z")), true); // 2h59 after the end
  assert.equal(isEventLive(tonight, new Date("2026-10-11T09:01:00Z")), false); // 3h01 after
});

test("a one-off with no end time is measured from its start", () => {
  const noEnd = oneOff("Show", "2026-10-11T01:00:00Z"); // 8 PM, 2h45 ago
  assert.equal(isEventLive(noEnd, NOW), true);
  assert.equal(isEventLive(noEnd, new Date("2026-10-11T04:30:00Z")), false);
});

test("an end time before the start is ignored rather than hiding the event early", () => {
  const bad = oneOff("Typo", "2026-10-12T01:00:00Z", "2026-10-11T01:00:00Z");
  assert.equal(occurrenceEnd(bad), null);
  assert.equal(isEventLive(bad, NOW), true);
});

test("an open-ended weekly series is live however old its first date is", () => {
  assert.equal(isEventLive(series("Taco Tuesday", "2026-06-02T16:00:00Z", "FREQ=WEEKLY;BYDAY=TU"), NOW), true);
});

test("a series past its UNTIL is not live", () => {
  // The three that were still published on 2026-10-10.
  assert.equal(
    isEventLive(series("The World's Game Watch Party", "2026-06-30T17:00:00Z", "FREQ=DAILY;UNTIL=20260719T235959Z"), NOW),
    false,
  );
  assert.equal(
    isEventLive(series("Saturdays in September", "2026-09-20T01:30:00Z", "FREQ=WEEKLY;BYDAY=SA;UNTIL=20260927T045959Z"), NOW),
    false,
  );
  assert.equal(
    isEventLive(series("Give Back Thursdays", "2026-09-24T16:00:00Z", "FREQ=WEEKLY;BYDAY=TH;UNTIL=20260925T045959Z"), NOW),
    false,
  );
});

test("a series whose UNTIL is still ahead is live, then stops", () => {
  const classSeries = series("Fall Cocktail Class", "2026-09-24T23:00:00Z", "FREQ=WEEKLY;BYDAY=TH;UNTIL=20261030T045959Z", "2026-09-25T00:00:00Z");
  assert.equal(isEventLive(classSeries, NOW), true);
  assert.equal(isEventLive(classSeries, new Date("2026-10-31T00:00:00Z")), false);
});

test("a far-off ends_at on a series is the series end, not a closing time", () => {
  // Older convention: POC M-I-C ran Mondays Jun 16 → Sep 16.
  const poc = series("The POC M-I-C", "2026-06-16T19:00:00Z", "FREQ=WEEKLY;BYDAY=MO", "2026-09-16T21:00:00Z");
  assert.equal(seriesEnd(poc).toISOString(), "2026-09-16T21:00:00.000Z");
  assert.equal(occurrenceEnd(poc), null);
  assert.equal(isEventLive(poc, new Date("2026-09-01T00:00:00Z")), true);
  assert.equal(isEventLive(poc, NOW), false);
});

test("a same-night ends_at on a series is one occurrence's end and never expires it", () => {
  const jazz = series("Jazz Thursdays", "2026-07-10T01:00:00Z", "FREQ=WEEKLY;BYDAY=TH", "2026-07-10T04:00:00Z");
  assert.equal(seriesEnd(jazz), null);
  assert.equal(occurrenceEnd(jazz).toISOString(), "2026-07-10T04:00:00.000Z");
  assert.equal(isEventLive(jazz, NOW), true);
});

test("a series with a rule we cannot parse is kept, not hidden", () => {
  assert.equal(isEventLive(series("Trivia", "2026-06-12T15:00:00Z", null), NOW), true);
  assert.equal(isEventLive(series("Odd", "2026-06-12T15:00:00Z", "Recurring Thursday series"), NOW), true);
  assert.equal(isEventLive(series("Fortnightly", "2026-06-12T15:00:00Z", "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"), NOW), true);
  assert.equal(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"), null);
});

// --------------------------------------------------------------------------
// 2. Next occurrence
// --------------------------------------------------------------------------

test("weekly: next occurrence keeps the local time of day", () => {
  // Tuesdays 11 AM Central, entered in June. From Sat Oct 10 → Tue Oct 13.
  const next = nextOccurrence(series("Taco Tuesday", "2026-06-02T16:00:00Z", "FREQ=WEEKLY;BYDAY=TU"), NOW);
  assert.equal(next.toISOString(), "2026-10-13T16:00:00.000Z");
});

test("weekly: the wall-clock time holds across the November DST change", () => {
  // 7 PM CDT is 00:00Z; after Nov 1 2026, 7 PM CST is 01:00Z.
  const ev = series("Trivia", "2026-09-03T00:00:00Z", "FREQ=WEEKLY;BYDAY=WE");
  assert.equal(nextOccurrence(ev, new Date("2026-10-27T12:00:00Z")).toISOString(), "2026-10-29T00:00:00.000Z");
  assert.equal(nextOccurrence(ev, new Date("2026-11-03T12:00:00Z")).toISOString(), "2026-11-05T01:00:00.000Z");
});

test("monthly: nth weekday, including two per month", () => {
  // Chartreuse Saloon, 2nd Thursday 7 PM.
  const second = series("Eight Ball Tournament", "2026-10-09T00:00:00Z", "FREQ=MONTHLY;BYDAY=2TH");
  assert.equal(nextOccurrence(second, NOW).toISOString(), "2026-11-13T01:00:00.000Z"); // Thu Nov 12, 7 PM CST
  // Third Place Lounge, 2nd and 4th Thursday 6 PM.
  const both = series("Live at Winnie's", "2026-10-08T23:00:00Z", "FREQ=MONTHLY;BYDAY=2TH,4TH");
  assert.equal(nextOccurrence(both, NOW).toISOString(), "2026-10-22T23:00:00.000Z");
});

test("monthly: 'last Friday' and a fifth weekday that only some months have", () => {
  const last = series("Last Friday", "2026-09-26T00:00:00Z", "FREQ=MONTHLY;BYDAY=-1FR");
  assert.equal(nextOccurrence(last, NOW).toISOString(), "2026-10-31T00:00:00.000Z"); // Fri Oct 30, 7 PM CDT
  const fifth = series("Fifth Friday", "2026-07-04T00:00:00Z", "FREQ=MONTHLY;BYDAY=5FR");
  // October 2026 has five Fridays (2, 9, 16, 23, 30).
  assert.equal(nextOccurrence(fifth, NOW).toISOString(), "2026-10-31T00:00:00.000Z");
});

test("a series does not occur before its own first date", () => {
  // Entered ahead of time: starts Thursday Nov 5.
  const future = series("New Night", "2026-11-06T01:00:00Z", "FREQ=WEEKLY;BYDAY=TH");
  assert.equal(nextOccurrence(future, NOW).toISOString(), "2026-11-06T01:00:00.000Z");
  assert.equal(occursOnLocalDate(future, 2026, 10, 15), false);
  assert.equal(occursOnLocalDate(future, 2026, 11, 5), true);
});

test("a one-off's next occurrence is itself, or nothing once it has started", () => {
  assert.equal(nextOccurrence(oneOff("Later", "2026-10-18T00:00:00Z"), NOW).toISOString(), "2026-10-18T00:00:00.000Z");
  assert.equal(nextOccurrence(oneOff("Earlier", "2026-10-01T00:00:00Z"), NOW), null);
});

// --------------------------------------------------------------------------
// 3. Order
// --------------------------------------------------------------------------

test("live events sort by next occurrence, not by starts_at", () => {
  const events = [
    series("Taco Tuesday", "2026-06-02T16:00:00Z", "FREQ=WEEKLY;BYDAY=TU"), // next Tue Oct 13
    series("Roof Top Brunch", "2026-06-06T15:00:00Z", "FREQ=WEEKLY;BYDAY=SU,SA"), // next Sun Oct 11
    oneOff("World Cup Final Watch", "2026-07-19T19:00:00Z"), // past
    oneOff("Halloween Party", "2026-11-01T01:00:00Z"), // Oct 31
    oneOff("Monday Night Football", "2026-10-13T00:15:00Z"), // Mon Oct 12
    series("Ended", "2026-06-30T17:00:00Z", "FREQ=DAILY;UNTIL=20260719T235959Z"), // over
    series("Mystery", "2026-06-12T15:00:00Z", null), // unknown rule → last
  ];
  assert.deepEqual(
    liveEventsSorted(events, NOW).map((e) => e.title),
    ["Roof Top Brunch", "Monday Night Football", "Taco Tuesday", "Halloween Party", "Mystery"],
  );
});

test("a special already under way tonight sorts as tonight, not as next week", () => {
  // Saturdays 9 PM; it is Saturday 10:45 PM.
  const tonight = series("Saturday Nights", "2026-07-12T02:00:00Z", "FREQ=WEEKLY;BYDAY=SA");
  const tomorrow = oneOff("Sunday Show", "2026-10-12T00:00:00Z");
  assert.deepEqual(liveEventsSorted([tomorrow, tonight], NOW).map((e) => e.title), ["Saturday Nights", "Sunday Show"]);
});

test("liveEventsSorted tolerates null and does not mutate its input", () => {
  assert.deepEqual(liveEventsSorted(null, NOW), []);
  const input = [oneOff("B", "2026-10-20T00:00:00Z"), oneOff("A", "2026-10-15T00:00:00Z")];
  liveEventsSorted(input, NOW);
  assert.equal(input[0].title, "B");
});

// --------------------------------------------------------------------------
// 4. Calendar days
// --------------------------------------------------------------------------

test("a one-off lands on its Kansas City date, not its UTC date", () => {
  // 9 PM Central on Sat Oct 10 is 02:00Z on the 11th.
  const ev = oneOff("Late Show", "2026-10-11T02:00:00Z");
  assert.equal(occursOnLocalDate(ev, 2026, 10, 10), true);
  assert.equal(occursOnLocalDate(ev, 2026, 10, 11), false);
});

test("a monthly series lands only on its nth weekday, not every week", () => {
  const ev = series("Eight Ball Tournament", "2026-09-11T00:00:00Z", "FREQ=MONTHLY;BYDAY=2TH");
  assert.equal(occursOnLocalDate(ev, 2026, 10, 8), true); // 2nd Thursday
  assert.equal(occursOnLocalDate(ev, 2026, 10, 15), false); // 3rd Thursday
  assert.equal(occursOnLocalDate(ev, 2026, 11, 12), true);
});

test("an ended series stops landing on its weekday", () => {
  const ev = series("Saturdays in September", "2026-09-06T01:30:00Z", "FREQ=WEEKLY;BYDAY=SA;UNTIL=20260927T045959Z");
  assert.equal(occursOnLocalDate(ev, 2026, 9, 26), true);
  assert.equal(occursOnLocalDate(ev, 2026, 10, 3), false);
});

// --------------------------------------------------------------------------
// 5. Labels
// --------------------------------------------------------------------------

test("recurrence labels cover every rule shape in the database", () => {
  assert.equal(recurrenceLabel("FREQ=WEEKLY;BYDAY=TU"), "Every Tue");
  assert.equal(recurrenceLabel("FREQ=WEEKLY;BYDAY=SU,SA"), "Every Sat, Sun");
  assert.equal(recurrenceLabel("FREQ=WEEKLY;BYDAY=TH,FR,SA"), "Every Thu, Fri, Sat");
  assert.equal(recurrenceLabel("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU"), "Daily");
  assert.equal(recurrenceLabel("FREQ=DAILY;UNTIL=20260719T235959Z"), "Daily");
  assert.equal(recurrenceLabel("FREQ=MONTHLY;BYDAY=2TH"), "2nd Thu of the month");
  assert.equal(recurrenceLabel("FREQ=MONTHLY;BYDAY=2TH,4TH"), "2nd & 4th Thu of the month");
  assert.equal(recurrenceLabel("FREQ=MONTHLY;BYDAY=1FR"), "1st Fri of the month");
  assert.equal(recurrenceLabel("FREQ=MONTHLY;BYDAY=3TH;UNTIL=20261218T055959Z"), "3rd Thu of the month");
  assert.equal(recurrenceLabel(null), "Recurring");
  assert.equal(recurrenceLabel("Recurring Thursday series"), "Recurring");
});

// --------------------------------------------------------------------------
// 6. Wiring — the rule has to actually be applied
// --------------------------------------------------------------------------

test("the two app copies of eventSchedule are identical", () => {
  assert.equal(read(MOBILE_COPY), read(DIRECTORY_COPY), `${MOBILE_COPY} has drifted from ${DIRECTORY_COPY}`);
  assert.equal(
    read(MOBILE_COPY.replace(".mjs", ".d.ts")),
    read(DIRECTORY_COPY.replace(".mjs", ".d.ts")),
    "the .d.ts copies have drifted",
  );
});

test("directory: every venue's events pass through liveEventsSorted", () => {
  const src = read("apps/directory/src/lib/queries.ts");
  const shape = src.slice(src.indexOf("function shapeVenue("), src.indexOf("\n}\n", src.indexOf("function shapeVenue(")));
  assert.match(shape, /liveEventsSorted\(/, "shapeVenue must filter and sort venue_events");
  assert.match(shape, /venue_events:\s*events\b/, "the filtered list is what the venue carries");
  // Every embedded select goes through shapeVenue; a new one that does not
  // would bring the bug straight back.
  const selects = src.match(/venue_events\(/g) ?? [];
  const shaped = src.match(/shapeVenue\b/g) ?? [];
  assert.ok(selects.length >= 3, "expected the three embedded venue_events selects");
  assert.ok(shaped.length > selects.length, "each venue_events select must be shaped");
});

test("directory: 'today' and the calendar use the schedule, not a BYDAY regex", () => {
  const src = read("apps/directory/src/lib/eventUtils.ts");
  assert.match(src, /occursOnLocalDate\(/);
  assert.doesNotMatch(src, /BYDAY=\(/);
});

test("directory: the venue page labels series via recurrenceLabel", () => {
  const src = read("apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx");
  assert.match(src, /recurrenceLabel\(ev\.recurrence_rule\)/);
  assert.match(src, /occurrenceEnd\(ev\)/);
});

test("mobile: the venue events hook filters and sorts, and no longer orders by starts_at", () => {
  const src = read("apps/mobile/src/hooks/useVenueEvents.ts");
  assert.match(src, /liveEventsSorted\(/);
  assert.doesNotMatch(src, /\.order\("starts_at"/, "ordering by starts_at with a limit buries one-offs behind old series");
});

test("mobile: the Events tab drops ended series and schedules by rule", () => {
  assert.match(read("apps/mobile/src/hooks/useUpcomingEvents.ts"), /isEventLive\(/);
  const screen = read("apps/mobile/src/screens/EventCalendarScreen.tsx");
  assert.match(screen, /occursOnLocalDate\(/);
  assert.doesNotMatch(screen, /BYDAY=\(/);
});

// --------------------------------------------------------------------------
// 7. The nightly delete
// --------------------------------------------------------------------------

const migName = readdirSync(join(root, "supabase/migrations")).find((f) => f.endsWith("_expire_venue_events.sql"));
const mig = migName ? read(`supabase/migrations/${migName}`) : "";

test("expiry migration: snapshots each row before deleting it", () => {
  assert.ok(migName, "the expire_venue_events migration must exist");
  assert.match(mig, /insert into archive\.venue_events_expired/);
  assert.match(mig, /to_jsonb\(ve\)/);
  // The delete is driven by the rows the snapshot insert returned.
  assert.match(mig, /delete from public\.venue_events ve\s+using archived a/);
});

test("expiry migration: SECURITY DEFINER is pinned and closed to API roles", () => {
  assert.match(mig, /security definer\s+set search_path = ''/);
  assert.match(mig, /revoke all on function public\.expire_venue_events\(interval, interval\) from public, anon, authenticated/);
  assert.match(mig, /alter table archive\.venue_events_expired enable row level security/);
  assert.match(mig, /revoke all on archive\.venue_events_expired from public, anon, authenticated/);
  assert.doesNotMatch(mig, /grant execute[^;]*to (anon|authenticated)/);
});

test("expiry migration: scheduled nightly, guarded for replays without pg_cron", () => {
  assert.match(mig, /'expire-venue-events-nightly',\s*'41 9 \* \* \*'/);
  assert.match(mig, /if exists \(select 1 from pg_extension where extname = 'pg_cron'\)/);
});

test("expiry migration: uses the same series-span threshold as the UI", async () => {
  const { SERIES_SPAN_MS } = await import(join(root, DIRECTORY_COPY));
  assert.equal(SERIES_SPAN_MS, 36 * 60 * 60 * 1000);
  assert.match(mig, /interval '36 hours'/);
});
