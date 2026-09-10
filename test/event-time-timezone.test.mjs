// Event timestamps must never be formatted in the runtime's timezone.
//
// WHY THIS FILE EXISTS
// --------------------
// `venue_events.starts_at` / `ends_at` are `timestamptz` — instants, not wall
// clocks. Formatting one with a bare `toLocaleTimeString()` uses whatever zone
// the *runtime* is in. On Vercel that is UTC, so every Kansas City event
// rendered five hours late and anything after 7 PM CT rolled onto the next
// calendar day: Ragazza's "Sunday Vinyl Sunday" (12–3 PM CT) displayed as
// "5:00 PM – 8:00 PM" on the live venue page.
//
// This was flagged on 2026-08-06 (Voltaire), spec'd on 2026-08-11
// (VENUE-EVENTS-FIX-SPEC-2026-08-11.md, "Bug 3"), and still shipped broken on
// 2026-08-16 — the recurrence half of that spec was implemented and the
// timezone half was not. A prose spec did not hold the line, so this test does.
//
// If you are here because this test failed: do not add a `timeZone` to a
// one-off call and move on. Use the shared formatters
// (`formatEventDate` / `formatEventTime` / `formatEventTimeRange` in
// apps/directory/src/lib/kcTime.mjs, or `formatEventDate` / `formatEventTime`
// in apps/mobile/src/lib/eventDisplay.ts) and pass the event's own `timezone`
// column.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const KC = join(root, "apps/directory/src/lib/kcTime.mjs");
const { formatEventDate, formatEventTime, formatEventTimeRange, KC_TZ } =
  await import(KC);

// --------------------------------------------------------------------------
// 1. Behaviour — the formatters must ignore the runtime zone entirely.
// --------------------------------------------------------------------------

// 2026-08-16T17:00:00Z is noon CT — the real Vinyl Sunday start. Rendered in
// UTC it reads "5:00 PM", which is exactly the bug.
const VINYL_START = "2026-08-16T17:00:00Z";
const VINYL_END = "2026-08-16T20:00:00Z";

test("event times render in Kansas City time, not the runtime zone", () => {
  assert.equal(formatEventTime(VINYL_START), "12:00 PM");
  assert.equal(formatEventTime(VINYL_END), "3:00 PM");
  assert.equal(formatEventTimeRange(VINYL_START, VINYL_END), "12:00 PM – 3:00 PM");
});

test("a null end time yields the start alone, not a dangling dash", () => {
  assert.equal(formatEventTimeRange(VINYL_START, null), "12:00 PM");
});

test("the UTC rendering that shipped is NOT what the formatter produces", () => {
  // Guards the specific regression: if someone drops the timeZone option, the
  // formatter starts agreeing with the buggy output and this fails.
  const buggy = new Date(VINYL_START).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  assert.equal(buggy, "5:00 PM", "sanity: UTC really does read 5 PM");
  assert.notEqual(formatEventTime(VINYL_START), buggy);
});

test("evening events keep the correct calendar day", () => {
  // 2026-08-17T01:00:00Z is 8 PM CT on the 16th. In UTC it is the 17th —
  // this is the "rolls Sat night into Sunday" symptom.
  const eveningCT = "2026-08-17T01:00:00Z";
  assert.equal(formatEventDate(eveningCT), "Sun, Aug 16");
  assert.equal(formatEventTime(eveningCT), "8:00 PM");
});

test("DST is handled — a January event is CST, not a fixed -5 offset", () => {
  // 18:00Z in January is noon CST. A hardcoded -5 would say 1 PM.
  assert.equal(formatEventTime("2026-01-15T18:00:00Z"), "12:00 PM");
});

test("an explicit non-KC zone is honoured, so the fallback is only a fallback", () => {
  assert.equal(formatEventTime(VINYL_START, "America/New_York"), "1:00 PM");
  assert.equal(KC_TZ, "America/Chicago");
});

// --------------------------------------------------------------------------
// 2. Static guard — no new bare call sites anywhere in the repo.
// --------------------------------------------------------------------------

const SRC_DIRS = ["apps/directory/src", "apps/web/src", "apps/mobile/src"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".expo"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(full)) out.push(full);
  }
  return out;
}

// Matches a toLocale{Date,Time,}String( ... ) call and captures its arguments,
// without spanning into a following call.
const LOCALE_CALL = /\.toLocale(?:Date|Time)?String\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

test("no event timestamp is formatted without an explicit timeZone", () => {
  const offenders = [];

  for (const dir of SRC_DIRS) {
    for (const file of walk(join(root, dir))) {
      const src = readFileSync(file, "utf8");
      // Only police files that actually deal with event instants.
      if (!/starts_at|ends_at/.test(src)) continue;

      for (const m of src.matchAll(LOCALE_CALL)) {
        const args = m[1];
        if (/timeZone/.test(args)) continue;

        // Is this call operating on an event timestamp? Look at the receiver
        // expression immediately before the call.
        const before = src.slice(Math.max(0, m.index - 90), m.index);
        if (!/starts_at|ends_at|eventDate|startsAt|endsAt/.test(before)) continue;

        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${relative(root, file)}:${line}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Event timestamps formatted without a timeZone:\n  ${offenders.join(
      "\n  ",
    )}\n\nUse the shared event formatters and pass the event's timezone column.`,
  );
});

test("the kcTime formatters themselves still pass timeZone through", () => {
  // The behavioural assertions above only prove the bug is gone when the test
  // runner is NOT in Central time — in CT, a formatter that dropped `timeZone`
  // would still coincidentally return the right string. CI runners are UTC
  // today, but that is not a guarantee worth resting on. This static check
  // holds in every zone.
  const src = read("apps/directory/src/lib/kcTime.mjs");
  const body = src.slice(src.indexOf("export function formatEventDate"));
  const calls = [...body.matchAll(/\.toLocale(?:Date|Time)?String\(([\s\S]*?)\)\s*;/g)];
  assert.ok(calls.length >= 2, "expected the event formatters to be present");
  for (const [, args] of calls) {
    assert.match(args, /timeZone/, "kcTime event formatter dropped its timeZone");
  }
});

test("the directory venue page uses the shared formatters", () => {
  const page = read("apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx");
  assert.match(page, /from "@\/lib\/kcTime"/);
  assert.match(page, /formatEventTime\(/);
  assert.match(page, /ev\.timezone/, "must prefer the event's own zone");
});

test("the directory query selects timezone alongside the event instants", () => {
  const queries = read("apps/directory/src/lib/queries.ts");
  // Every embedded venue_events select must carry timezone, or the page has
  // nothing to format with and silently falls back to KC for non-KC venues.
  const selects = [...queries.matchAll(/venue_events\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(selects.length >= 3, "expected the three venue_events selects");
  for (const sel of selects) {
    if (!/starts_at/.test(sel)) continue;
    assert.match(sel, /timezone/, `venue_events select missing timezone: ${sel}`);
  }
});

test("mobile event formatters take a timezone and default to the venue zone", () => {
  const disp = read("apps/mobile/src/lib/eventDisplay.ts");
  assert.match(disp, /VENUE_FALLBACK_TZ\s*=\s*"America\/Chicago"/);
  assert.match(disp, /formatEventDate\(\s*dateStr: string,\s*timeZone/);
  assert.match(disp, /formatEventTime\(/);
});
