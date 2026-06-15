-- Recovered from prod ledger (supabase_migrations.schema_migrations) on 2026-06-15.
-- Applied to prod 2026-06-13 via MCP; mirrored here to close schema drift.

-- Audit log of every Places validation check
CREATE TABLE IF NOT EXISTS public.venue_validation_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  places_id       text,
  stored_address  text,
  google_address  text,
  match_score     numeric,          -- 0..1 similarity
  mismatch        boolean NOT NULL,
  checked_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venue_validation_log_venue ON public.venue_validation_log(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_validation_log_checked ON public.venue_validation_log(checked_at);

-- Track when each venue was last validated, so the worker can pick oldest-first
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS places_validated_at timestamptz;

-- Token table (mirrors private.geocode_job_tokens / places_job_tokens)
CREATE TABLE IF NOT EXISTS private.validate_job_tokens (
  token       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Token getter (mirrors get_geocode_job_token / get_places_job_token)
CREATE OR REPLACE FUNCTION public.get_validate_job_token()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'private', 'public'
AS $$
  SELECT token FROM private.validate_job_tokens ORDER BY updated_at DESC LIMIT 1;
$$;
