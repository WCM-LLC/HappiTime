-- Fix RLS: authenticated users could not read published venue data
-- In Supabase, `public` role policies do NOT apply to authenticated users.
-- The existing authenticated SELECT policies only allowed org owners/managers,
-- so regular logged-in app users saw no venues, offers, or images.

-- Allow authenticated users to read published venue_media
CREATE POLICY "venue_media_select_authenticated_public"
ON venue_media
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM venues v
    WHERE v.id = venue_media.venue_id
    AND v.status = 'published'
  )
);

-- Allow authenticated users to read published venues
CREATE POLICY "venues_select_authenticated_public"
ON venues
FOR SELECT
TO authenticated
USING (status = 'published');

-- Allow authenticated users to read offers for published venues
CREATE POLICY "happy_hour_offers_select_authenticated_public"
ON happy_hour_offers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM venues v
    WHERE v.id = happy_hour_offers.venue_id
    AND v.status = 'published'
  )
);
