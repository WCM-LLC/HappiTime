import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const MODULE = join(repoRoot, "apps/directory/src/lib/kcTime.mjs");

const { kcNow, kcNowParts, formatClock } = await import(MODULE);

// HappiTime is a Kansas City directory. "Open now", "today's hours" and
// "today's events" mean *in Kansas City*. KCMapPage used to derive these from
// the visitor's clock, so anyone outside Central time saw the wrong day — and
// during the hours either side of midnight, so did everyone.

test("reads Kansas City wall clock during daylight saving (CDT, UTC-5)", () => {
  // 02:30 UTC on Jul 28 is 21:30 on Jul 27 in Kansas City.
  const d = kcNow(new Date("2026-07-28T02:30:00Z"));
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6, "July");
  assert.equal(d.getDate(), 27, "still the 27th in KC");
  assert.equal(d.getHours(), 21);
  assert.equal(d.getMinutes(), 30);
});

test("reads Kansas City wall clock during standard time (CST, UTC-6)", () => {
  // The offset differs by an hour in winter — a fixed offset would fail here.
  const d = kcNow(new Date("2026-01-15T02:30:00Z"));
  assert.equal(d.getMonth(), 0, "January");
  assert.equal(d.getDate(), 14, "still the 14th in KC");
  assert.equal(d.getHours(), 20);
  assert.equal(d.getMinutes(), 30);
});

test("the calendar DAY can differ from UTC, which is the actual bug", () => {
  // 02:30 UTC on the 28th is still 9:30pm on the 27th in Kansas City. A
  // directory keyed off UTC (or off a visitor further east) would show
  // Tuesday's happy hours while KC is still in Monday evening service.
  const ref = new Date("2026-07-28T02:30:00Z");
  assert.equal(ref.getUTCDate(), 28, "UTC has already rolled over");
  assert.equal(kcNow(ref).getDate(), 27, "Kansas City has not");
  assert.equal(kcNowParts(ref).minutes, 21 * 60 + 30);
});

test("kcNowParts returns KC day-of-week and minutes past midnight", () => {
  const ref = new Date("2026-07-28T02:30:00Z"); // 21:30 Mon Jul 27 in KC
  const { dow, minutes } = kcNowParts(ref);
  assert.equal(minutes, 21 * 60 + 30);
  assert.equal(dow, new Date(2026, 6, 27).getDay(), "day-of-week follows KC's date");
});

test("formatClock renders a 12-hour label", () => {
  assert.equal(formatClock(0), "12:00 AM");
  assert.equal(formatClock(12 * 60), "12:00 PM");
  assert.equal(formatClock(17 * 60 + 47), "5:47 PM");
});

test("the /kc/ map derives 'now' from Kansas City, not the browser", () => {
  // The original bug: `const now = new Date(); const todayDow = now.getDay();`
  // fed isOpenNow(), eventOccursToday() and the "today's hours" row.
  const map = readFileSync(
    join(repoRoot, "apps/directory/src/components/KCMapPage.tsx"),
    "utf8"
  );
  assert.match(map, /kcNow\(\)/, "KCMapPage must take its clock from kcNow()");
  // Parameterised `new Date(year, month, ...)` calendar math is fine; a bare
  // `new Date()` is the visitor's clock and is what regressed here.
  assert.doesNotMatch(
    map,
    /new Date\(\s*\)/,
    "a bare new Date() reintroduces the visitor's timezone"
  );
});

test("the result does not depend on the machine's timezone", () => {
  // The regression this guards: the answer must be identical whether the
  // process runs in Kansas City, London, or Auckland.
  const script = `
    const { kcNow } = await import(${JSON.stringify(MODULE)});
    const d = kcNow(new Date("2026-07-28T02:30:00Z"));
    process.stdout.write([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()].join(","));
  `;
  const run = (tz) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    });

  const expected = "2026,6,27,21,30";
  for (const tz of ["America/Chicago", "Europe/London", "Pacific/Auckland", "UTC"]) {
    assert.equal(run(tz), expected, `TZ=${tz} produced a different Kansas City time`);
  }
});
