-- Org-level email notification preferences (owner-facing).
--
-- The venue dashboard Settings tab exposes three toggles for what events email
-- the organization owner: a new venue review, happy-hour reminders, and a weekly
-- summary. These columns persist that choice per org so delivery (a future review
-- trigger and weekly-summary cron) can read the flags. This migration adds storage
-- + defaults only; it does not wire any sending.
--
-- Defaults mirror the dashboard's shipped state: new-review on, reminders off,
-- weekly summary on. Follows the existing user_preferences boolean-column
-- convention (notifications_* NOT NULL DEFAULT).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) so a clean replay and prod converge.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS notify_new_review           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_happy_hour_reminders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_weekly_summary       boolean NOT NULL DEFAULT true;
