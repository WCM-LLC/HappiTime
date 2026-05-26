import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readMigration(filename) {
  return fs.readFileSync(path.resolve("supabase/migrations", filename), "utf8");
}

test("venue_visits migrations include dwell fields used by mobile and admin", () => {
  const sql = readMigration("20260525232635_add_venue_visit_dwell_columns.sql");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS exited_at timestamptz/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS duration_minutes integer/i);
  assert.match(sql, /venue_visits_duration_minutes_nonnegative/i);
  assert.match(sql, /venue_visits_exited_after_entered/i);
});

test("missing remote avatar migration is restored with the original version", () => {
  const sql = readMigration("20260521120000_avatar_storage_select_policy.sql");

  assert.match(sql, /avatars_select_own/i);
  assert.match(sql, /bucket_id = 'user-avatars'/i);
  assert.match(sql, /FOR SELECT TO authenticated/i);
});

test("venue_visits RLS hardening removes anonymous access and scopes policies to authenticated users", () => {
  const sql = readMigration("20260525234000_harden_venue_visits_rls.sql");

  assert.match(sql, /REVOKE ALL ON TABLE public\.venue_visits FROM anon/i);
  assert.match(sql, /GRANT SELECT,\s*INSERT,\s*UPDATE,\s*DELETE ON TABLE public\.venue_visits TO authenticated/i);
  assert.match(sql, /FOR SELECT\s+TO authenticated/i);
  assert.match(sql, /FOR INSERT\s+TO authenticated/i);
  assert.match(sql, /FOR UPDATE\s+TO authenticated/i);
  assert.match(sql, /FOR DELETE\s+TO authenticated/i);
  assert.match(sql, /v\.status = 'published'/i);
});

test("check-in pipeline migration adds RPC duplicate guard and user_events mirror", () => {
  const sql = readMigration("20260526045023_checkin_pipeline_blockers.sql");

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_venue_visit/i);
  assert.match(sql, /RETURNS TABLE\(id uuid, inserted boolean\)/i);
  assert.match(sql, /abs\(extract\(epoch FROM \(vv\.entered_at - v_entered_at\)\)\) < 7200/i);
  assert.match(sql, /CREATE TRIGGER venue_visits_prevent_duplicate_window/i);
  assert.match(sql, /CREATE TRIGGER venue_visits_sync_user_event/i);
  assert.match(sql, /'visit_id', NEW\.id/i);
  assert.match(sql, /event_type IN \('auto_checkin', 'venue_checkin'/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_venue_visit_stats/i);
});

test("backend RLS migrations keep backend tables and rate-limit function service-only", () => {
  const tableSql = readMigration("20260526045028_harden_backend_rls_tables.sql");
  const functionSql = readMigration("20260526045628_lock_down_check_rate_limit_execute.sql");

  assert.match(tableSql, /ALTER TABLE public\.api_rate_limits ENABLE ROW LEVEL SECURITY/i);
  assert.match(tableSql, /ALTER TABLE public\.notion_venue_import ENABLE ROW LEVEL SECURITY/i);
  assert.match(tableSql, /REVOKE ALL ON TABLE public\.api_rate_limits FROM anon, authenticated/i);
  assert.match(tableSql, /REVOKE ALL ON TABLE public\.notion_venue_import FROM anon, authenticated/i);
  assert.match(functionSql, /REVOKE ALL ON FUNCTION public\.check_rate_limit\(text, integer, integer\) FROM PUBLIC, anon, authenticated/i);
  assert.match(functionSql, /GRANT EXECUTE ON FUNCTION public\.check_rate_limit\(text, integer, integer\) TO service_role/i);
});
