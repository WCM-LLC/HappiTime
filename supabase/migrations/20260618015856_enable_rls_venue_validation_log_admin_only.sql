-- Recovered from prod (supabase_migrations.schema_migrations) to reconcile drift:
-- this was applied out-of-band on 2026-06-18 and never committed. Content is the
-- exact recorded statement. See [[zero-migration-drift]] discipline.

ALTER TABLE public.venue_validation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_validation_log_admin_all
  ON public.venue_validation_log
  FOR ALL
  TO authenticated
  USING (public.is_happitime_admin())
  WITH CHECK (public.is_happitime_admin());
