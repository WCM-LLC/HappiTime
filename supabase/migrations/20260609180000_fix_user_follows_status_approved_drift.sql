-- Fix the 'approved' vs 'accepted' drift in user_follows.status.
--
-- The app and the CHECK constraint use the value set {'pending','accepted'}, but
-- two objects leaked the value 'approved' (which no row ever holds):
--   1. The live column DEFAULT was 'approved' — drift from migration
--      20260525041854 which declared it 'accepted'. A status-less INSERT
--      (e.g. useUserFollowers.toggleFollow) gets 'approved' and FAILS the
--      CHECK (status IN ('pending','accepted')), which still enforces on new
--      rows despite being NOT VALID.
--   2. Policy venue_visits_friends_select matched user_follows.status='approved',
--      so it never matched any row — friends could never see each other's
--      visits at promoted venues.
--
-- This migration realigns both to the canonical 'accepted'.

-- 1. Restore the intended column default.
ALTER TABLE public.user_follows
  ALTER COLUMN status SET DEFAULT 'accepted';

-- 2. Defensively normalize any stray 'approved' rows (none expected).
UPDATE public.user_follows
SET status = 'accepted'
WHERE status = 'approved';

-- 3. All rows now satisfy the constraint; validate it so it stops being NOT VALID.
ALTER TABLE public.user_follows
  VALIDATE CONSTRAINT user_follows_status_check;

-- 4. Recreate the venue_visits friends-visibility policy against 'accepted'.
DROP POLICY IF EXISTS "venue_visits_friends_select" ON public.venue_visits;
CREATE POLICY "venue_visits_friends_select" ON public.venue_visits
  FOR SELECT
  USING (
    (EXISTS (
      SELECT 1 FROM public.user_follows
      WHERE user_follows.follower_id = auth.uid()
        AND user_follows.following_user_id = venue_visits.user_id
        AND user_follows.status = 'accepted'
    ))
    AND (EXISTS (
      SELECT 1 FROM public.venues
      WHERE venues.id = venue_visits.venue_id
        AND venues.promotion_tier IS NOT NULL
    ))
  );
