-- Enable RLS on backend-only tables that had it disabled.
--
-- Investigation summary (2026-05-24):
--   All six tables are accessed exclusively by service_role (admin scripts, RPC
--   functions, triggers). No client-side code (anon or authenticated supabase-js)
--   queries any of them directly:
--     * staging_venues / staging_happy_hour_windows — only referenced in
--       merge_staging_venues() RPC and import-places README; no client queries.
--     * venues_snapshot / happy_hour_windows_snapshot / reference_snapshots —
--       only touched by capture_reference_snapshot() and restore_venue_from_snapshot()
--       RPCs invoked from admin scripts.
--     * reserved_handles — anon/authenticated already REVOKED in
--       20260518120000_super_users_and_guides.sql; client uses the in-process
--       isReservedHandle() from shared-types, not a DB query. The
--       check_reserved_handle() trigger is SECURITY DEFINER (runs as owner,
--       bypasses RLS) so enabling RLS here does not break handle validation.
--
-- service_role bypasses RLS at the Postgres connection level, so all existing
-- backend access (migrations, RPCs, triggers, edge functions, admin scripts)
-- continues to work with zero new policies.
--
-- NOTE (drift guard): five of these tables — staging_venues,
-- staging_happy_hour_windows, venues_snapshot, happy_hour_windows_snapshot,
-- reference_snapshots — currently exist only in the live database and are NOT
-- created by any committed migration. On a clean `supabase db reset` (CI) they
-- do not exist, so each ALTER is guarded with to_regclass() and skipped when the
-- table is absent. On production (where all tables exist) every ALTER runs.
-- TODO: backfill CREATE TABLE migrations for the five drifted tables, then this
-- guard can be removed.
--
-- Rollback: supabase/snippets/rollback_rls_backend_tables.sql

DO $$
DECLARE
  t text;
  backend_tables text[] := ARRAY[
    'staging_venues',
    'staging_happy_hour_windows',
    'venues_snapshot',
    'happy_hour_windows_snapshot',
    'reference_snapshots',
    'reserved_handles'
  ];
BEGIN
  FOREACH t IN ARRAY backend_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      RAISE NOTICE 'Enabled RLS on public.%', t;
    ELSE
      RAISE NOTICE 'Skipped public.% (table not present in this database)', t;
    END IF;
  END LOOP;
END $$;
