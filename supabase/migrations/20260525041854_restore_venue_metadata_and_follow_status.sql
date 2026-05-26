-- Restore schema fields already used by the apps and generated types.
-- This also ensures the following places_id index migration can run on a fresh DB.

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS data_locked_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS geocode_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS geocode_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocode_last_error text,
  ADD COLUMN IF NOT EXISTS geocode_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocode_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS places_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS places_id text,
  ADD COLUMN IF NOT EXISTS places_last_error text,
  ADD COLUMN IF NOT EXISTS places_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS places_next_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS places_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rating numeric,
  ADD COLUMN IF NOT EXISTS review_count integer,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'venues_rating_range'
      AND conrelid = 'public.venues'::regclass
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_rating_range
      CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'venues_review_count_nonnegative'
      AND conrelid = 'public.venues'::regclass
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_review_count_nonnegative
      CHECK (review_count IS NULL OR review_count >= 0)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.user_follows
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted';

UPDATE public.user_follows
SET status = 'accepted'
WHERE status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_follows_status_check'
      AND conrelid = 'public.user_follows'::regclass
  ) THEN
    ALTER TABLE public.user_follows
      ADD CONSTRAINT user_follows_status_check
      CHECK (status IN ('pending', 'accepted'))
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_follows_following_status_idx
  ON public.user_follows (following_user_id, status);

GRANT UPDATE (status) ON public.user_follows TO authenticated;

DROP POLICY IF EXISTS "user_follows_update_target_accept" ON public.user_follows;
CREATE POLICY "user_follows_update_target_accept"
  ON public.user_follows
  FOR UPDATE
  TO authenticated
  USING (following_user_id = auth.uid())
  WITH CHECK (following_user_id = auth.uid() AND status = 'accepted');

DROP POLICY IF EXISTS "user_follows_delete_related" ON public.user_follows;
DROP POLICY IF EXISTS "user_follows_delete_owner" ON public.user_follows;
CREATE POLICY "user_follows_delete_related"
  ON public.user_follows
  FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid() OR following_user_id = auth.uid());
