BEGIN;

-- A) Pin search_path on functions flagged by the linter (no behavior change; blocks search-path injection)
ALTER FUNCTION public.propagate_org_name_to_venues()      SET search_path = public, pg_temp;
ALTER FUNCTION public.set_venue_org_name()                 SET search_path = public, pg_temp;
ALTER FUNCTION public.venues_queue_geocode()               SET search_path = public, pg_temp;
ALTER FUNCTION public.hh_days_from_text(text)              SET search_path = public, pg_temp;
ALTER FUNCTION public.venues_queue_places_sync()           SET search_path = public, pg_temp;
ALTER FUNCTION public.venue_slugify(text)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.venues_ensure_slug()                 SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.whoami()                             SET search_path = public, pg_temp;

-- B) Revoke client-role EXECUTE on internal job/cron functions (called only by edge functions w/ service_role)
REVOKE EXECUTE ON FUNCTION public.invoke_geocode_venues()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_places_import()   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_geocode_job_token()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_places_job_token()   FROM anon, authenticated;

-- C) Revoke ALL public/client EXECUTE on trigger and auth-hook functions
--    (Triggers and auth hooks are invoked by the database, not by REST callers — they don't need EXECUTE on the API role.)
REVOKE EXECUTE ON FUNCTION public.propagate_org_name_to_venues() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_venue_org_name()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC, anon, authenticated;

-- D) Require auth to create an organization (anon should never create orgs)
REVOKE EXECUTE ON FUNCTION public.create_organization(text) FROM anon;
-- authenticated keeps EXECUTE

COMMIT;
