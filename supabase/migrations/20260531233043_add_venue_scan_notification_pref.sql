-- Per-user opt-out for venue-team scan notifications: a venue's owners/managers get
-- a push when their venue records an attribution event (track-visit). Default on;
-- a missing user_preferences row is treated as on by the sender.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS notifications_venue_scans boolean NOT NULL DEFAULT true;
