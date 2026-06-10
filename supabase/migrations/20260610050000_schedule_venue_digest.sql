-- Venue digest cron infrastructure: private job-token + SECURITY DEFINER
-- invoke wrapper + hourly cron schedule.
--
-- Pattern mirrors autotag_infrastructure (20260610030130) exactly:
--   private.digest_job_tokens  →  get_digest_job_token()  →  invoke_send_venue_digest()
--   cron.schedule fires hourly; the DST-safe 6 AM CT guard lives INSIDE the
--   edge function, not in the cron schedule (avoids twice-yearly edits).
--
-- The edge function is verify_jwt=false; invoke sends only x-digest-token
-- (no Authorization header needed — mirrors invoke_autotag pattern).
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, INSERT+WHERE NOT EXISTS,
-- cron guarded by pg_cron extension check.

-- ── 1. Private job-token table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private.digest_job_tokens (
  id         integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  token      text    NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the token on first run (single row, idempotent)
INSERT INTO private.digest_job_tokens (token)
SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE NOT EXISTS (SELECT 1 FROM private.digest_job_tokens);

GRANT SELECT, INSERT, UPDATE ON TABLE private.digest_job_tokens TO service_role;

-- ── 2. get_digest_job_token() — service_role-only reader ─────────────────────
CREATE OR REPLACE FUNCTION public.get_digest_job_token()
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'private', 'public'
AS $$
  SELECT token FROM private.digest_job_tokens ORDER BY updated_at DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_digest_job_token() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_digest_job_token() TO service_role;

-- ── 3. invoke_send_venue_digest() — cron wrapper (SECURITY DEFINER) ──────────
CREATE OR REPLACE FUNCTION public.invoke_send_venue_digest()
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
  FROM private.digest_job_tokens
  ORDER BY updated_at DESC LIMIT 1;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'digest job token not configured';
  END IF;

  SELECT net.http_post(
    url     := 'https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/send-venue-digest',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-digest-token',  v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_send_venue_digest() FROM public, anon, authenticated;
-- service_role executes this via cron

-- ── 4. Hourly cron schedule (guarded — only where pg_cron is installed) ───────
-- Fires every hour at :00; the 6 AM CT guard inside the function restricts actual
-- sends to the one window that overlaps 6am America/Chicago (CDT=11:00Z, CST=12:00Z).
-- This survives DST transitions without any cron edits.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'send-venue-digest-hourly',
      '0 * * * *',
      'SELECT public.invoke_send_venue_digest();'
    );
  END IF;
END $$;
