-- Autotag automation infrastructure: run audit, per-venue state, cron job token.
-- Applied to prod via MCP on 2026-06-09; recorded as version 20260610030130.
-- See docs/autotag-verification-process.md for the full design.

CREATE TABLE IF NOT EXISTS autotag_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('dry-run','suggest','apply')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  venues_processed integer NOT NULL DEFAULT 0,
  suggestions_created integer NOT NULL DEFAULT 0,
  auto_applied integer NOT NULL DEFAULT 0,
  queued_for_review integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS autotag_venue_state (
  venue_id uuid PRIMARY KEY REFERENCES venues(id) ON DELETE CASCADE,
  last_autotagged_at timestamptz NOT NULL DEFAULT now(),
  last_run_id uuid REFERENCES autotag_runs(id) ON DELETE SET NULL,
  last_suggestion_count integer NOT NULL DEFAULT 0
);

ALTER TABLE autotag_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autotag_venue_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY autotag_runs_admin_all ON autotag_runs
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY autotag_venue_state_admin_all ON autotag_venue_state
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Cron job token, mirroring private.geocode_job_tokens pattern
CREATE TABLE IF NOT EXISTS private.autotag_job_tokens (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO private.autotag_job_tokens (token)
SELECT replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
WHERE NOT EXISTS (SELECT 1 FROM private.autotag_job_tokens);

CREATE OR REPLACE FUNCTION public.get_autotag_job_token()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public'
AS $function$
  select token from private.autotag_job_tokens order by updated_at desc limit 1;
$function$;

REVOKE ALL ON FUNCTION public.get_autotag_job_token() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_autotag_job_token() TO service_role;

-- Cron wrapper: POST to the autotag-venues edge function via pg_net
CREATE OR REPLACE FUNCTION public.invoke_autotag(p_mode text DEFAULT 'apply', p_limit integer DEFAULT 60)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public'
AS $function$
DECLARE
  v_token text;
  v_request_id bigint;
BEGIN
  SELECT token INTO v_token FROM private.autotag_job_tokens ORDER BY updated_at DESC LIMIT 1;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'autotag job token not configured';
  END IF;
  SELECT net.http_post(
    url := 'https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/autotag-venues',
    headers := jsonb_build_object('x-autotag-token', v_token, 'content-type', 'application/json'),
    body := jsonb_build_object('mode', p_mode, 'limit', p_limit),
    timeout_milliseconds := 300000
  ) INTO v_request_id;
  RETURN v_request_id;
END
$function$;

REVOKE ALL ON FUNCTION public.invoke_autotag(text, integer) FROM public, anon, authenticated;

-- Nightly schedule (created via cron.schedule on prod, jobid 8):
--   select cron.schedule('autotag-venues-nightly', '10 9 * * *',
--     $$select public.invoke_autotag('apply', 60);$$);
