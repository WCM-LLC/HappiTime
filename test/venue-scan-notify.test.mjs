import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildVenueScanMessage } from "../supabase/functions/_shared/scan-message.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("migration adds notifications_venue_scans default true", () => {
  const sql = read("supabase/migrations/20260531233043_add_venue_scan_notification_pref.sql");
  assert.match(
    sql,
    /add column if not exists notifications_venue_scans boolean not null default true/i,
  );
});

test("buildVenueScanMessage: qr scan", () => {
  const m = buildVenueScanMessage("qr", "Sea Capitán");
  assert.match(m.title, /QR scan/i);
  assert.match(m.body, /scanned your QR code at Sea Capitán/);
});

test("buildVenueScanMessage: app_checkin", () => {
  const m = buildVenueScanMessage("app_checkin", "Sea Capitán");
  assert.match(m.title, /check-in/i);
  assert.match(m.body, /checked in at Sea Capitán/);
});

test("buildVenueScanMessage: push_click/organic/unknown fall back to a generic visit", () => {
  for (const s of ["push_click", "organic", "whatever"]) {
    const m = buildVenueScanMessage(s, "Sea Capitán");
    assert.match(m.title, /visit/i);
    assert.match(m.body, /Sea Capitán/);
  }
});

test("buildVenueScanMessage: blank venue name has a safe fallback", () => {
  const m = buildVenueScanMessage("qr", "");
  assert.match(m.body, /your venue/);
});

test("shared expo-push exports sendExpoPush and batches at 100", () => {
  const src = read("supabase/functions/_shared/expo-push.ts");
  assert.match(src, /export async function sendExpoPush/);
  assert.match(src, /BATCH_SIZE = 100/);
});

test("notify-upcoming-happy-hours uses the shared sender (one sender, not two)", () => {
  const src = read("supabase/functions/notify-upcoming-happy-hours/index.ts");
  assert.match(src, /from "\.\.\/_shared\/expo-push\.ts"/);
  assert.match(src, /sendExpoPush\(/);
});

test("track-visit selects org_id + name and notifies the team AFTER a recorded insert", () => {
  const src = read("supabase/functions/track-visit/index.ts");
  assert.match(src, /select\("id, org_id, name"\)/);
  assert.match(src, /EdgeRuntime\.waitUntil\(\s*\n?\s*notifyVenueTeam/);
  const insertIdx = src.indexOf('from("venue_attribution_events")');
  const waitIdx = src.indexOf("EdgeRuntime.waitUntil");
  assert.ok(insertIdx > 0 && waitIdx > insertIdx, "push hook must come after the insert");
});

test("track-visit targets owners/managers, respects prefs, and opens the venue", () => {
  const src = read("supabase/functions/track-visit/index.ts");
  assert.match(src, /\.in\("role", \["owner", "manager"\]\)/);
  assert.match(src, /notifications_venue_scans/);
  assert.match(src, /notifications_push/);
  assert.match(src, /type: "venue"/);
  assert.match(src, /ExponentPushToken/);
});
