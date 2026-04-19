-- Anonymous analytics for the public SEO directory site.
-- Tracks page views and venue clicks without requiring authentication.
-- Logged-in users also write to user_events for unified reporting.

CREATE TABLE IF NOT EXISTS public.directory_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text NOT NULL,                -- 'page_view', 'venue_click', 'cta_click'
  page_path   text,                          -- e.g. '/kc/westport/'
  venue_id    uuid REFERENCES public.venues(id),
  referrer    text,
  user_agent  text,
  session_id  text,                          -- anonymous fingerprint (cookie or generated)
  user_id     uuid REFERENCES auth.users(id),-- populated only if signed in
  meta        jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for venue-level analytics aggregation
CREATE INDEX IF NOT EXISTS idx_directory_events_venue
  ON public.directory_events (venue_id, created_at DESC)
  WHERE venue_id IS NOT NULL;

-- Index for page-level analytics
CREATE INDEX IF NOT EXISTS idx_directory_events_page
  ON public.directory_events (page_path, created_at DESC);

-- RLS: anyone can insert (anonymous tracking), only service role can read
ALTER TABLE public.directory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts"
  ON public.directory_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Service role reads all"
  ON public.directory_events
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Authenticated users read own events"
  ON public.directory_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
