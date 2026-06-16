-- Recovered from prod ledger (supabase_migrations.schema_migrations) on 2026-06-15.
-- Applied to prod 2026-06-13 via MCP; mirrored here to close schema drift.

-- Wrapper mirrors invoke_geocode_venues: reads token, POSTs to the edge function.
CREATE OR REPLACE FUNCTION public.invoke_validate_venues()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  function_url text := 'https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/validate-venue-places';
  job_token text;
begin
  job_token := public.get_validate_job_token();
  if job_token is null or job_token = '' then
    raise exception 'Missing validate job token in private.validate_job_tokens';
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Validate-Token', job_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$function$;

-- Hourly, small batch — bounded Places API cost. Sweeps whole table over ~1 day,
-- then keeps re-checking oldest-first on rotation.
-- Guarded by a pg_cron extension check so a fresh migration replay (CI / new
-- environments without pg_cron) is a no-op rather than erroring on the missing
-- "cron" schema; mirrors 20260611120000_schedule_upcoming_push.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('validate-venue-places-hourly', '37 * * * *', 'SELECT public.invoke_validate_venues();');
  END IF;
END $$;
