-- Enable RLS on six backend-only tables that had it disabled.
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
-- Rollback: supabase/snippets/rollback_rls_backend_tables.sql

-- ── staging_venues ────────────────────────────────────────────────────────────
-- Backend-only staging table. Used by merge_staging_venues() RPC only.
-- service_role bypasses RLS; no anon/authenticated access intended.
ALTER TABLE public.staging_venues ENABLE ROW LEVEL SECURITY;

-- ── staging_happy_hour_windows ───────────────────────────────────────────────
-- Backend-only staging table. Paired with staging_venues for bulk import review.
-- service_role bypasses RLS; no anon/authenticated access intended.
ALTER TABLE public.staging_happy_hour_windows ENABLE ROW LEVEL SECURITY;

-- ── venues_snapshot ──────────────────────────────────────────────────────────
-- Point-in-time venue snapshots for rollback. Written and read exclusively by
-- capture_reference_snapshot() and restore_venue_from_snapshot() RPCs.
-- service_role bypasses RLS; no anon/authenticated access intended.
ALTER TABLE public.venues_snapshot ENABLE ROW LEVEL SECURITY;

-- ── happy_hour_windows_snapshot ──────────────────────────────────────────────
-- Point-in-time window snapshots. Same access model as venues_snapshot.
-- service_role bypasses RLS; no anon/authenticated access intended.
ALTER TABLE public.happy_hour_windows_snapshot ENABLE ROW LEVEL SECURITY;

-- ── reference_snapshots ──────────────────────────────────────────────────────
-- Parent snapshot header rows. Same access model as the two snapshot detail tables.
-- service_role bypasses RLS; no anon/authenticated access intended.
ALTER TABLE public.reference_snapshots ENABLE ROW LEVEL SECURITY;

-- ── reserved_handles ─────────────────────────────────────────────────────────
-- Blocklist for handle registration. anon/authenticated are already REVOKED
-- (20260518120000_super_users_and_guides.sql). The check_reserved_handle()
-- trigger is SECURITY DEFINER so RLS does not affect it.
-- service_role bypasses RLS; no anon/authenticated access intended.
ALTER TABLE public.reserved_handles ENABLE ROW LEVEL SECURITY;
