// test/intake-content-classification.test.mjs
//
// A scanned photo can be a happy hour, a dated event, or something that
// repeats weekly. HappiTime stores the first as happy_hour_windows and the
// others as venue_events, so getting the classification wrong writes real
// content into the wrong shape — and scraped/scanned data reaching a public
// listing unverified is exactly what HT-SOP-003 exists to prevent.
//
// The model only ever PROPOSES; a human confirms before commit. These tests
// cover the deterministic half: normalization, the recurrence rule, and
// resolving a proposal to the concrete starts_at venue_events demands.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

// The helpers are TypeScript, so mirror their contract here and pin the source
// against it — the same approach the window-matching tests use.
const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const buildRecurrenceRule = (dow) => {
  const days = [...new Set(dow)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => RRULE_DAYS[d]);
  return days.length > 0 ? `FREQ=WEEKLY;BYDAY=${days.join(",")}` : null;
};

test("recurrence rules match the format event-actions.ts already writes", () => {
  // The console builds `FREQ=WEEKLY;BYDAY=TH` by hand, and the mobile calendar
  // screens parse that shape. A scan must not invent a second dialect.
  assert.equal(buildRecurrenceRule([4]), "FREQ=WEEKLY;BYDAY=TH");
  assert.equal(buildRecurrenceRule([5, 6]), "FREQ=WEEKLY;BYDAY=FR,SA");
  assert.equal(buildRecurrenceRule([0]), "FREQ=WEEKLY;BYDAY=SU");
  // Order and duplicates from a sloppy model response must normalize.
  assert.equal(buildRecurrenceRule([6, 5, 5]), "FREQ=WEEKLY;BYDAY=FR,SA");
  assert.equal(buildRecurrenceRule([]), null);
  assert.equal(buildRecurrenceRule([9, -1]), null, "out-of-range days are dropped");
});

test("the console's own RRULE format is what we matched", () => {
  const actions = read("apps/web/src/actions/event-actions.ts");
  assert.match(actions, /FREQ=WEEKLY;BYDAY=\$\{rruleDays\.join\(','\)\}/);
});

test("the classifier is instructed to decide before extracting", () => {
  const route = read("apps/web/src/app/api/intake/extract/route.ts");
  assert.match(route, /CLASSIFICATION RULES \(decide this first\)/);
  // "unknown" has to be a real option, or the model will label a plain food
  // menu as a happy hour just because it came from a bar.
  assert.match(route, /Do NOT guess\s*\n?\s*"happy_hour" just because it is a bar/);
  assert.match(route, /A human confirms your answer before anything is saved/);
});

test("malformed event proposals are rejected before review", () => {
  const route = read("apps/web/src/app/api/intake/extract/route.ts");
  // A recurring event with no weekday cannot be scheduled; a one-off with no
  // date cannot be placed on a calendar. Both must fail validation.
  assert.match(route, /is recurring but has no recurrence_dow/);
  assert.match(route, /needs a date \(or mark it recurring\)/);
  assert.match(route, /events\[\$\{i\}\]\.date must be YYYY-MM-DD or null/);
});

test("an unrecognized content_type degrades instead of failing the scan", () => {
  const content = read("apps/web/src/utils/intake-content.ts");
  assert.match(content, /export function normalizeContentType/);
  assert.match(content, /\? \(value as ContentType\)\s*:\s*'unknown'/);
});

test("event types stay inside the venue_events check constraint", () => {
  const content = read("apps/web/src/utils/intake-content.ts");
  const migration = read("supabase/migrations/20260423130000_events_cuisine_tags.sql");
  const declared = [...content.matchAll(/'(event|special|live_music|trivia|sports|other)'/g)].map((m) => m[1]);
  for (const t of new Set(declared)) {
    assert.ok(
      migration.includes(`'${t}'`),
      `${t} must exist in the venue_events.event_type check constraint`
    );
  }
});

// ── resolveEventStart ────────────────────────────────────────────────────────
//
// venue_events.starts_at is NOT NULL, but a sign reading "Trivia every
// Thursday" carries no date at all. So a recurring proposal resolves to its
// next occurrence, and today counts only while the event has not started yet —
// otherwise scanning a board at 9pm on trivia night schedules an event that
// already finished.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const resolveEventStart = (event, now, timeZone = "America/Chicago") => {
  const time = event.start_time;
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (event.date && DATE_RE.test(event.date)) return { date: event.date, time };
  if (!event.is_recurring) return null;
  const dows = (event.recurrence_dow ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (dows.length === 0) return null;
  const local = new Date(now.toLocaleString("en-US", { timeZone }));
  const todayDow = local.getDay();
  const nowMinutes = local.getHours() * 60 + local.getMinutes();
  const [h, m] = time.split(":").map(Number);
  const eventMinutes = h * 60 + m;
  let bestOffset = null;
  for (const d of dows) {
    let offset = (d - todayDow + 7) % 7;
    if (offset === 0 && eventMinutes <= nowMinutes) offset = 7;
    if (bestOffset === null || offset < bestOffset) bestOffset = offset;
  }
  if (bestOffset === null) return null;
  const first = new Date(local);
  first.setDate(first.getDate() + bestOffset);
  return {
    date: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(first.getDate()).padStart(2, "0")}`,
    time,
  };
};

// 2026-08-12 is a Wednesday. 18:00 UTC is 13:00 in Kansas City.
const WED_1PM_KC = new Date("2026-08-12T18:00:00Z");

test("a dated one-off keeps its own date", () => {
  const got = resolveEventStart({ start_time: "19:00", date: "2026-08-21" }, WED_1PM_KC);
  assert.deepEqual(got, { date: "2026-08-21", time: "19:00" });
});

test("a weekly event resolves to its next occurrence", () => {
  // Thursday is tomorrow.
  const got = resolveEventStart(
    { start_time: "19:00", is_recurring: true, recurrence_dow: [4] },
    WED_1PM_KC
  );
  assert.deepEqual(got, { date: "2026-08-13", time: "19:00" });
});

test("today counts only while the event has not started", () => {
  const stillToCome = resolveEventStart(
    { start_time: "19:00", is_recurring: true, recurrence_dow: [3] },
    WED_1PM_KC
  );
  assert.equal(stillToCome.date, "2026-08-12", "7pm on a Wednesday, scanned at 1pm, is tonight");

  // Same board photographed at 9pm KC — that trivia night is over.
  const alreadyDone = resolveEventStart(
    { start_time: "19:00", is_recurring: true, recurrence_dow: [3] },
    new Date("2026-08-13T02:00:00Z")
  );
  assert.equal(alreadyDone.date, "2026-08-19", "rolls to next week, not tonight");
});

test("multi-day recurrence picks the soonest day", () => {
  // Fridays and Saturdays, scanned on a Wednesday.
  const got = resolveEventStart(
    { start_time: "20:00", is_recurring: true, recurrence_dow: [5, 6] },
    WED_1PM_KC
  );
  assert.equal(got.date, "2026-08-14", "Friday beats Saturday");
});

test("unschedulable proposals return null rather than guessing a date", () => {
  // Not recurring and not dated — a human has to say when.
  assert.equal(resolveEventStart({ start_time: "19:00" }, WED_1PM_KC), null);
  // Recurring but no weekday given.
  assert.equal(
    resolveEventStart({ start_time: "19:00", is_recurring: true, recurrence_dow: [] }, WED_1PM_KC),
    null
  );
  // Garbage time.
  assert.equal(resolveEventStart({ start_time: "7pm", date: "2026-08-21" }, WED_1PM_KC), null);
});

test("scheduling uses the venue's calendar, not the server's", () => {
  const content = read("apps/web/src/utils/intake-content.ts");
  assert.match(content, /toLocaleString\("en-US", \{ timeZone \}\)|toLocaleString\('en-US', \{ timeZone \}\)/);
  assert.match(content, /timeZone = 'America\/Chicago'/);
});

// ── The human gate ───────────────────────────────────────────────────────────
//
// The whole point of the classification work: a person confirms what the photo
// is before anything is written. A flyer misread as a happy hour would put a
// one-night event's hours on a venue's public listing as if they ran weekly.
const screen = () => read("apps/mobile/src/screens/ScanMenuScreen.tsx");

test("the model's proposal is never auto-confirmed", () => {
  const s = screen();
  assert.match(s, /setConfirmedType\(null\)/, "each extraction must reset the confirmation");
  assert.doesNotMatch(
    s,
    /setConfirmedType\(contentType\)/,
    "pre-selecting the model's guess turns the gate into a rubber stamp"
  );
});

test("submit is blocked until a type is confirmed", () => {
  const s = screen();
  assert.match(s, /confirmedType != null &&/);
  assert.match(s, /confirmedType !== "unknown" &&/, "'unknown' must not be submittable");
});

test("'unknown' is a model output, not a human choice", () => {
  const s = screen();
  assert.match(s, /const CONFIRMABLE_TYPES: ContentType\[\] = \["happy_hour", "event", "event_series", "mixed"\]/);
});

test("the confirmed type decides what gets written, not the proposal", () => {
  const s = screen();
  assert.match(s, /contentType: confirmedType \?\? "unknown"/);
  // Reclassifying a menu as an event must not still create happy-hour windows.
  assert.match(s, /windowIds: isHappyHour \? windowIds : \[\]/);
  assert.match(s, /newWindows: isHappyHour \? newWindows : \[\]/);
  assert.match(s, /events: isEventy \? events : \[\]/);
  // The derived flags must come from the confirmation, never the proposal.
  assert.match(s, /const isHappyHour = confirmedType === "happy_hour"/);
  assert.doesNotMatch(s, /const isHappyHour = proposedType/);
});

test("an undated one-off is called out rather than silently sent", () => {
  const s = screen();
  assert.match(s, /This one has no date/);
});
