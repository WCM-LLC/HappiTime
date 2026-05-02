-- Add default privacy preference for check-ins.
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS default_checkin_privacy text;

ALTER TABLE public.user_preferences
DROP CONSTRAINT IF EXISTS user_preferences_default_checkin_privacy_check;

ALTER TABLE public.user_preferences
ADD CONSTRAINT user_preferences_default_checkin_privacy_check
CHECK (default_checkin_privacy IN ('private', 'friends'));

-- Backfill existing users to safe default and enforce default moving forward.
UPDATE public.user_preferences
SET default_checkin_privacy = 'private'
WHERE default_checkin_privacy IS NULL;

ALTER TABLE public.user_preferences
ALTER COLUMN default_checkin_privacy SET DEFAULT 'private';

ALTER TABLE public.user_preferences
ALTER COLUMN default_checkin_privacy SET NOT NULL;
