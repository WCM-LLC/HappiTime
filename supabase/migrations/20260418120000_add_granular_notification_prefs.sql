-- Add granular notification preference columns
-- These allow users to individually toggle happy hour reminders,
-- venue update alerts, and friend activity notifications.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS notifications_happy_hours    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notifications_venue_updates  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notifications_friend_activity boolean NOT NULL DEFAULT true;
