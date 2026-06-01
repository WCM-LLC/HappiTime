import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { summarizeScans, computeWindows, formatRelativeTime } from "../apps/web/src/utils/scan-analytics.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const W = (now) => ({
  todayStart: new Date(now - 3 * 3600 * 1000).toISOString(), // 3h ago
  weekStart: new Date(now - 7 * 24 * 3600 * 1000).toISOString(),
  monthStart: new Date(now - 30 * 24 * 3600 * 1000).toISOString(),
});
const at = (now, msAgo, source) => ({ source, created_at: new Date(now - msAgo).toISOString() });

test("summarizeScans buckets by window and source, newest-first recent", () => {
  const now = Date.parse("2026-05-31T12:00:00Z");
  const events = [
    at(now, 1 * 3600 * 1000, "qr"),               // 1h -> today,week,month
    at(now, 5 * 3600 * 1000, "qr"),               // 5h -> week,month (todayStart=3h)
    at(now, 3 * 24 * 3600 * 1000, "app_checkin"), // 3d -> week,month
    at(now, 10 * 24 * 3600 * 1000, "organic"),    // 10d -> month
    at(now, 40 * 24 * 3600 * 1000, "qr"),         // 40d -> none
  ];
  const s = summarizeScans(events, W(now));
  assert.equal(s.today, 1);
  assert.equal(s.week, 3);
  assert.equal(s.month, 4);
  assert.deepEqual(s.bySource, { qr: 3, app_checkin: 1, push_click: 0, organic: 1 });
  assert.equal(s.recent[0].created_at, new Date(now - 1 * 3600 * 1000).toISOString());
});

test("summarizeScans ignores unknown source in bySource but still counts windows", () => {
  const now = Date.parse("2026-05-31T12:00:00Z");
  const s = summarizeScans([at(now, 1000, "weird"), at(now, 2000, "qr")], W(now));
  assert.equal(s.month, 2);
  assert.deepEqual(s.bySource, { qr: 1, app_checkin: 0, push_click: 0, organic: 0 });
});

test("summarizeScans caps recent at 8", () => {
  const now = Date.parse("2026-05-31T12:00:00Z");
  const events = Array.from({ length: 12 }, (_, i) => at(now, (i + 1) * 1000, "qr"));
  assert.equal(summarizeScans(events, W(now)).recent.length, 8);
});

test("summarizeScans empty input -> zeros", () => {
  const now = Date.parse("2026-05-31T12:00:00Z");
  const s = summarizeScans([], W(now));
  assert.deepEqual({ t: s.today, w: s.week, m: s.month, r: s.recent.length }, { t: 0, w: 0, m: 0, r: 0 });
  assert.deepEqual(s.bySource, { qr: 0, app_checkin: 0, push_click: 0, organic: 0 });
});

test("computeWindows: today within last 24h, windows ordered", () => {
  const now = new Date("2026-05-31T18:30:00Z");
  const w = computeWindows("America/Chicago", now);
  assert.ok(new Date(w.todayStart) <= now);
  assert.ok(now.getTime() - new Date(w.todayStart).getTime() <= 24 * 3600 * 1000);
  assert.ok(new Date(w.weekStart) < new Date(w.todayStart));
  assert.ok(new Date(w.monthStart) < new Date(w.weekStart));
});

test("computeWindows: invalid timezone falls back without throwing", () => {
  const w = computeWindows("Not/AZone", new Date("2026-05-31T18:30:00Z"));
  assert.equal(typeof w.todayStart, "string");
});

test("formatRelativeTime", () => {
  const now = new Date("2026-05-31T12:00:00Z");
  assert.match(formatRelativeTime(new Date(now.getTime() - 30 * 1000).toISOString(), now), /just now/);
  assert.equal(formatRelativeTime(new Date(now.getTime() - 5 * 60 * 1000).toISOString(), now), "5m ago");
  assert.equal(formatRelativeTime(new Date(now.getTime() - 3 * 3600 * 1000).toISOString(), now), "3h ago");
  assert.equal(formatRelativeTime(new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(), now), "2d ago");
});

test("VenueScanAnalytics renders windows/sources/empty state and uses the util", () => {
  const src = read("apps/web/src/components/VenueScanAnalytics.tsx");
  assert.match(src, /Scan activity/);
  assert.match(src, /from ['"]@\/utils\/scan-analytics['"]/);
  assert.match(src, /No scans yet/);
  assert.match(src, /last 30 days/);
  assert.match(src, /Check-in/);
});
