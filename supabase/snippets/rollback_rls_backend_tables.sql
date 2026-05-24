-- Rollback for 20260524061914_enable_rls_backend_tables.sql
--
-- Disables RLS on the six backend-only tables. No policies were created in the
-- up migration, so there is nothing to DROP here.
--
-- Apply this migration to revert if needed:
--   supabase db push  (after placing this file in the migrations directory)

ALTER TABLE public.staging_venues           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_happy_hour_windows DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues_snapshot           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.happy_hour_windows_snapshot DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_snapshots       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserved_handles          DISABLE ROW LEVEL SECURITY;
