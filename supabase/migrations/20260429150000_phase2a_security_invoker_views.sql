BEGIN;

-- A) Switch 5 SECURITY DEFINER views to SECURITY INVOKER
--    PG 17 supports ALTER VIEW ... SET (security_invoker = true) — no DROP/recreate needed.
--    With SECURITY INVOKER the caller's RLS is enforced instead of the view owner's.

ALTER VIEW public.upcoming_events                        SET (security_invoker = true);
ALTER VIEW public.published_happy_hour_windows           SET (security_invoker = true);
ALTER VIEW public.venue_event_counts                     SET (security_invoker = true);
ALTER VIEW public.promoted_venues                        SET (security_invoker = true);

-- published_happy_hour_windows_with_names JOINs organizations.
-- The existing anon SELECT policy on organizations has a self-join bug (v.org_id = v.id)
-- that makes it a dead policy. Fix it before switching the view so anon still gets org_name.
DROP POLICY IF EXISTS organizations_select_public ON public.organizations;
CREATE POLICY organizations_select_public ON public.organizations
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.org_id = organizations.id
        AND v.status = 'published'
    )
  );

ALTER VIEW public.published_happy_hour_windows_with_names SET (security_invoker = true);

COMMIT;
