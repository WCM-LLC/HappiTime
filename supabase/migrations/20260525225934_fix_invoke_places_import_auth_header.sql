-- import-places is deployed verify_jwt=true, so the gateway requires an Authorization
-- JWT. invoke_places_import only sent X-Places-Token, so every call 401'd at the gateway
-- and the photo pull silently never ran. Add the public anon JWT to clear the gateway;
-- the secret X-Places-Token remains the real auth inside the function.
CREATE OR REPLACE FUNCTION public.invoke_places_import()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  function_url text := 'https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/import-places';
  job_token text;
begin
  job_token := public.get_places_job_token();
  if job_token is null or job_token = '' then
    raise exception 'Missing places job token in private.places_job_tokens';
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZmxjcmpzaXlob2Zub211cmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMTY2MDQsImV4cCI6MjA4MjY5MjYwNH0.oW1YYoBE0TuJg0iyngMSY2RY-X0dEZrjQIhb-Oy2Gqs',
      'X-Places-Token', job_token
    ),
    body := '{}'::jsonb
  );
end;
$function$;
