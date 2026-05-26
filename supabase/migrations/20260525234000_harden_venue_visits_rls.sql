-- Harden check-in visibility. Venue visits are user activity records, so they
-- should never be readable or mutable by anonymous clients.

ALTER TABLE public.venue_visits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.venue_visits FROM anon;
REVOKE ALL ON TABLE public.venue_visits FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.venue_visits TO authenticated;
GRANT ALL ON TABLE public.venue_visits TO service_role;

DROP POLICY IF EXISTS "venue_visits_select_owner_or_public" ON public.venue_visits;
DROP POLICY IF EXISTS "venue_visits_select_owner_or_visible" ON public.venue_visits;

CREATE POLICY "venue_visits_select_owner_or_visible"
  ON public.venue_visits
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      is_private = false
      AND EXISTS (
        SELECT 1
        FROM public.venues v
        WHERE v.id = public.venue_visits.venue_id
          AND v.status = 'published'
      )
    )
  );

DROP POLICY IF EXISTS "venue_visits_insert_owner" ON public.venue_visits;
CREATE POLICY "venue_visits_insert_owner"
  ON public.venue_visits
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "venue_visits_update_owner" ON public.venue_visits;
CREATE POLICY "venue_visits_update_owner"
  ON public.venue_visits
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "venue_visits_delete_owner" ON public.venue_visits;
CREATE POLICY "venue_visits_delete_owner"
  ON public.venue_visits
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
