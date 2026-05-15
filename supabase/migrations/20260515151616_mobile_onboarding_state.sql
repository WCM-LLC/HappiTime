-- Mobile first-run onboarding state and preference capture.
-- Existing users are marked complete so the new flow only appears for
-- accounts created after this migration is applied.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'welcome',
  ADD COLUMN IF NOT EXISTS onboarding_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS location_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_permission_status text,
  ADD COLUMN IF NOT EXISTS notifications_permission_status text;

ALTER TABLE public.user_preferences
DROP CONSTRAINT IF EXISTS user_preferences_onboarding_step_check;

ALTER TABLE public.user_preferences
ADD CONSTRAINT user_preferences_onboarding_step_check
CHECK (
  onboarding_step IN (
    'welcome',
    'location',
    'preferences',
    'notifications',
    'profile',
    'complete'
  )
);

ALTER TABLE public.user_preferences
DROP CONSTRAINT IF EXISTS user_preferences_location_permission_status_check;

ALTER TABLE public.user_preferences
ADD CONSTRAINT user_preferences_location_permission_status_check
CHECK (
  location_permission_status IS NULL
  OR location_permission_status IN ('undetermined', 'granted', 'denied')
);

ALTER TABLE public.user_preferences
DROP CONSTRAINT IF EXISTS user_preferences_notifications_permission_status_check;

ALTER TABLE public.user_preferences
ADD CONSTRAINT user_preferences_notifications_permission_status_check
CHECK (
  notifications_permission_status IS NULL
  OR notifications_permission_status IN ('undetermined', 'granted', 'denied')
);

UPDATE public.user_preferences
SET
  onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
  onboarding_step = 'complete',
  location_enabled = true
WHERE onboarding_completed_at IS NULL;

INSERT INTO public.user_preferences (
  user_id,
  onboarding_completed_at,
  onboarding_step,
  onboarding_version,
  location_enabled
)
SELECT
  users.id,
  now(),
  'complete',
  1,
  true
FROM auth.users AS users
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_preferences AS prefs
  WHERE prefs.user_id = users.id
);
