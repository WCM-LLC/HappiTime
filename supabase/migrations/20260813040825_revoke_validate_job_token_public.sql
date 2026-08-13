-- Revoke public/anon/authenticated EXECUTE on the validate-job entry points.
--
-- `public.get_validate_job_token()` is SECURITY DEFINER and was granted to
-- PUBLIC, anon and authenticated. The anon key is public by design — it ships
-- in the mobile bundle and the web client — so this was effectively
-- unauthenticated. Verified against production on 2026-08-12:
--
--   POST /rest/v1/rpc/get_validate_job_token  (anon key) -> 200, returns token
--   POST /rest/v1/rpc/get_digest_job_token    (anon key) -> 401
--
-- The digest twin was locked down correctly; this one was missed. That
-- asymmetry is what identifies it as an oversight rather than a decision.
--
-- `public.invoke_validate_venues()` carried the same grants and calls
-- get_validate_job_token() before invoking the validate-venue-places edge
-- function, so anyone holding the public key could read the token and then
-- trigger the job at will. That job calls the Google Places API (billable) and
-- writes venue rows.
--
-- Nothing legitimate loses access:
--   - cron job 14 (validate-venue-places-hourly, '37 * * * *') runs
--     `SELECT public.invoke_validate_venues();` as the job owner, which keeps
--     EXECUTE via the postgres grant.
--   - the validate-venue-places edge function reads the token through
--     supabase.rpc() using SUPABASE_SERVICE_ROLE_KEY, and service_role keeps
--     EXECUTE.
--
-- Root cause: 20260613220157_add_validate_venues_wrapper_and_cron.sql created
-- both functions with CREATE OR REPLACE FUNCTION and issued no GRANT or
-- REVOKE. In Postgres, EXECUTE on a function defaults to PUBLIC, so the grant
-- was never written — it was inherited by omission. The earlier equivalents
-- each got a dedicated lockdown step and this one did not:
--
--   20260115101500  lockdown_geocode_cron              ✓
--   20260115121000  lockdown_places_cron               ✓
--   20260613220157  add_validate_venues_wrapper_and_cron   (no lockdown)
--
-- Any future SECURITY DEFINER function reachable over PostgREST needs an
-- explicit revoke in the same migration that creates it. Default-open is the
-- trap; silence in a migration is what grants access here.
--
-- Both revokes are idempotent; REVOKE on an absent grant is a no-op.

revoke execute on function public.get_validate_job_token() from public;
revoke execute on function public.get_validate_job_token() from anon;
revoke execute on function public.get_validate_job_token() from authenticated;

revoke execute on function public.invoke_validate_venues() from public;
revoke execute on function public.invoke_validate_venues() from anon;
revoke execute on function public.invoke_validate_venues() from authenticated;

-- State the intended reachability explicitly, so a future GRANT ... TO PUBLIC
-- on the schema does not silently re-open these.
grant execute on function public.get_validate_job_token() to service_role;
grant execute on function public.invoke_validate_venues() to service_role;

comment on function public.get_validate_job_token() is
  'Returns the validate-venue-places job token. service_role/postgres ONLY — never grant to anon or authenticated; the anon key is public and this token authenticates a billable job.';

comment on function public.invoke_validate_venues() is
  'Triggers the validate-venue-places edge function. service_role/postgres ONLY — invoked by cron job validate-venue-places-hourly.';
