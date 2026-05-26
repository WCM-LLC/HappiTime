-- Add dwell-tracking columns used by the mobile visit tracker and admin check-in view.
-- These columns already exist in generated types and app queries, but were missing
-- from the canonical migration history for fresh/local databases.

ALTER TABLE public.venue_visits
  ADD COLUMN IF NOT EXISTS exited_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'venue_visits_duration_minutes_nonnegative'
      AND conrelid = 'public.venue_visits'::regclass
  ) THEN
    ALTER TABLE public.venue_visits
      ADD CONSTRAINT venue_visits_duration_minutes_nonnegative
      CHECK (duration_minutes IS NULL OR duration_minutes >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'venue_visits_exited_after_entered'
      AND conrelid = 'public.venue_visits'::regclass
  ) THEN
    ALTER TABLE public.venue_visits
      ADD CONSTRAINT venue_visits_exited_after_entered
      CHECK (exited_at IS NULL OR exited_at >= entered_at)
      NOT VALID;
  END IF;
END $$;
