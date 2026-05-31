import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildVenueScanMessage } from "../supabase/functions/_shared/scan-message.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("migration adds notifications_venue_scans default true", () => {
  const sql = read("supabase/migrations/20260531230000_add_venue_scan_notification_pref.sql");
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
