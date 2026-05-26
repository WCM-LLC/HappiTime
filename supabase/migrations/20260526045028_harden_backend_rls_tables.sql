-- Backend-only tables should not be readable or writable through public clients.
-- service_role keeps direct access and bypasses RLS for server-side rate-limit
-- checks/import tooling.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_count integer;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_limit <= 0 OR p_window_seconds <= 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.api_rate_limits AS rl (key, window_start, count, updated_at)
  VALUES (p_key, v_now, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
      WHEN rl.window_start <= v_window_start THEN 1
      ELSE rl.count + 1
    END,
    window_start = CASE
      WHEN rl.window_start <= v_window_start THEN v_now
      ELSE rl.window_start
    END,
    updated_at = v_now
  RETURNING rl.count INTO v_count;

  RETURN v_count > p_limit;
END;
$$;

CREATE TABLE IF NOT EXISTS public.notion_venue_import (
  "Name" text,
  "Address" text,
  "Phone Number" text,
  "Website URL" text,
  "Business URL" text,
  "Rating" numeric,
  "Opening Hours" text,
  "Happy Hour Details" text,
  "Happy Hour Category" text
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_venue_import ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_rate_limits FROM anon, authenticated;
REVOKE ALL ON TABLE public.notion_venue_import FROM anon, authenticated;

GRANT ALL ON TABLE public.api_rate_limits TO service_role;
GRANT ALL ON TABLE public.notion_venue_import TO service_role;
