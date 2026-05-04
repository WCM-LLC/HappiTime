-- venue_visits: user check-in/history records.
-- Older schema history referenced this table without creating it, which made
-- later migrations fail and left mobile history/check-in features without a
-- durable table in fresh environments.
CREATE TABLE IF NOT EXISTS public.venue_visits (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id    UUID        NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT        NOT NULL DEFAULT 'manual',
  is_private  BOOLEAN     NOT NULL DEFAULT false,
  rating      INTEGER,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_visits
  ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating INTEGER,
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.venue_visits
  DROP CONSTRAINT IF EXISTS venue_visits_rating_range,
  ADD CONSTRAINT venue_visits_rating_range
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

-- Some older app code used visited_at while newer code writes entered_at.
-- Keep a generated compatibility column so both query shapes work.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'venue_visits'
      AND column_name = 'visited_at'
  ) THEN
    ALTER TABLE public.venue_visits
      ADD COLUMN visited_at TIMESTAMPTZ GENERATED ALWAYS AS (entered_at) STORED;
  END IF;
END $$;

DROP TRIGGER IF EXISTS venue_visits_set_updated_at ON public.venue_visits;
CREATE TRIGGER venue_visits_set_updated_at
  BEFORE UPDATE ON public.venue_visits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_visits_select_owner_or_public" ON public.venue_visits;
CREATE POLICY "venue_visits_select_owner_or_public"
  ON public.venue_visits
  FOR SELECT
  USING (user_id = auth.uid() OR is_private = false);

DROP POLICY IF EXISTS "venue_visits_insert_owner" ON public.venue_visits;
CREATE POLICY "venue_visits_insert_owner"
  ON public.venue_visits
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "venue_visits_update_owner" ON public.venue_visits;
CREATE POLICY "venue_visits_update_owner"
  ON public.venue_visits
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "venue_visits_delete_owner" ON public.venue_visits;
CREATE POLICY "venue_visits_delete_owner"
  ON public.venue_visits
  FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS venue_visits_user_entered_idx
  ON public.venue_visits (user_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS venue_visits_venue_entered_idx
  ON public.venue_visits (venue_id, entered_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_visits TO authenticated;

-- Per-venue notification opt-out (user blocks happy-hour pings from a specific venue)
CREATE TABLE IF NOT EXISTS user_venue_notification_blocks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id    UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

ALTER TABLE user_venue_notification_blocks ENABLE ROW LEVEL SECURITY;

-- Users manage only their own blocks; venues can count blocks against themselves via service role
DROP POLICY IF EXISTS "users_manage_own_notification_blocks"
  ON user_venue_notification_blocks;

CREATE POLICY "users_manage_own_notification_blocks"
  ON user_venue_notification_blocks
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notification_blocks_user_id
  ON user_venue_notification_blocks (user_id);

CREATE INDEX IF NOT EXISTS idx_notification_blocks_venue_id
  ON user_venue_notification_blocks (venue_id);
