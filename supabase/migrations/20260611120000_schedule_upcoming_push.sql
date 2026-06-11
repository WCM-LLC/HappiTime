-- Upcoming-push cron infrastructure: shared notify job-token + two SECURITY
-- DEFINER invoke wrappers + two hourly pg_cron schedules.
--
-- Pattern mirrors autotag_infrastructure (20260610030130) and
-- schedule_venue_digest (20260610050000) exactly:
--   private.notify_job_tokens → get_notify_job_token()
--   → invoke_notify_happy_hours() / invoke_notify_events()
--   → cron.schedule fires hourly at :00
--
-- Both edge functions are verify_jwt=false; invoke wrappers send only
-- x-notify-token (no Authorization header needed).
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE,
-- INSERT+WHERE NOT EXISTS, cron guarded by pg_cron extension check.

-- ── 1. Private job-token table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private.notify_job_tokens (
  id         integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  token      text    NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the token on first run (single row, idempotent)
INSERT INTO private.notify_job_tokens (token)
SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE NOT EXISTS (SELECT 1 FROM private.notify_job_tokens);

GRANT SELECT, INSERT, UPDATE ON TABLE private.notify_job_tokens TO service_role;

-- ── 2. get_notify_job_token() — service_role-only reader ─────────────────────
CREATE OR REPLACE FUNCTION public.get_notify_job_token()
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'private', 'public'
AS $$
  SELECT token FROM private.notify_job_tokens ORDER BY updated_at DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_notify_job_token() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_notify_job_token() TO service_role;

-- ── 3. invoke_notify_happy_hours() — cron wrapper (SECURITY DEFINER) ─────────
CREATE OR REPLACE FUNCTION public.invoke_notify_happy_hours()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'private', 'public'
AS $$
DECLARE
  v_token      text;
  v_request_id bigint;
BEGIN
  SELECT token INTO v_token
  FROM private.notify_job_tokens
  ORDER BY updated_at DESC LIMIT 1;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'notify job token not configured';
  END IF;

  SELECT net.http_post(
    url     := 'https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/notify-upcoming-happy-hours',
    headers := jsonb_build_object(
      'x-notify-token',  v_token,
      'content-type',    'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_notify_happy_hours() FROM public, anon, authenticated;

-- ── 4. invoke_notify_events() — cron wrapper (SECURITY DEFINER) ──────────────
CREATE OR REPLACE FUNCTION public.invoke_notify_events()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'private', 'public'
AS $$
DECLARE
  v_token      text;
  v_request_id bigint;
BEGIN
  SELECT token INTO v_token
  FROM private.notify_job_tokens
  ORDER BY updated_at DESC LIMIT 1;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'notify job token not configured';
  END IF;

  SELECT net.http_post(
    url     := 'https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/notify-upcoming-events',
    headers := jsonb_build_object(
      'x-notify-token',  v_token,
      'content-type',    'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_notify_events() FROM public, anon, authenticated;

-- ── 5. Hourly cron schedules (guarded — only where pg_cron is installed) ──────
-- Fires every hour at :00; the appropriate time guards inside each function
-- ensure notifications are only sent during relevant windows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('notify-happy-hours-hourly', '0 * * * *', 'SELECT public.invoke_notify_happy_hours();');
    PERFORM cron.schedule('notify-events-hourly', '0 * * * *', 'SELECT public.invoke_notify_events();');
  END IF;
END $$;
