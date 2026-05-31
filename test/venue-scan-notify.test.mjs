import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("migration adds notifications_venue_scans default true", () => {
  const sql = read("supabase/migrations/20260531230000_add_venue_scan_notification_pref.sql");
  assert.match(
    sql,
    /add column if not exists notifications_venue_scans boolean not null default true/i,
  );
});
