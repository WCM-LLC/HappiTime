-- Harden Super User guide authoring at the database boundary.
--
-- The web console already blocks non-Super Users before they reach guide
-- authoring routes/actions. These policy changes make the same rule true for
-- direct Supabase Data API access: only user_profiles.role = 'super_user' can
-- create/manage their own guide drafts and submission audit rows. Super Admins
-- remain covered by the existing is_happitime_admin() admin policies.

CREATE OR REPLACE FUNCTION public.is_happitime_super_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE user_id = auth.uid()
      AND role = 'super_user'
  );
$$;

REVOKE ALL ON FUNCTION public.is_happitime_super_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_happitime_super_user() TO authenticated;

DROP POLICY IF EXISTS "guides_select_own" ON public.guides;
CREATE POLICY "guides_select_own"
  ON public.guides FOR SELECT
  USING (
    author_id = auth.uid()
    AND public.is_happitime_super_user()
  );

DROP POLICY IF EXISTS "guides_insert_own" ON public.guides;
CREATE POLICY "guides_insert_own"
  ON public.guides FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_happitime_super_user()
    AND status = 'draft'
  );

DROP POLICY IF EXISTS "guides_update_own" ON public.guides;
CREATE POLICY "guides_update_own"
  ON public.guides FOR UPDATE
  USING (
    author_id = auth.uid()
    AND public.is_happitime_super_user()
  )
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_happitime_super_user()
    AND status IN ('draft', 'pending_review', 'archived')
  );

DROP POLICY IF EXISTS "guides_delete_own" ON public.guides;
CREATE POLICY "guides_delete_own"
  ON public.guides FOR DELETE
  USING (
    author_id = auth.uid()
    AND public.is_happitime_super_user()
  );

DROP POLICY IF EXISTS "guide_submissions_select_own" ON public.guide_submissions;
CREATE POLICY "guide_submissions_select_own"
  ON public.guide_submissions FOR SELECT
  USING (
    public.is_happitime_super_user()
    AND EXISTS (
      SELECT 1 FROM public.guides g
      WHERE g.id = guide_id
        AND g.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "guide_submissions_insert_own" ON public.guide_submissions;
CREATE POLICY "guide_submissions_insert_own"
  ON public.guide_submissions FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND public.is_happitime_super_user()
    AND EXISTS (
      SELECT 1 FROM public.guides g
      WHERE g.id = guide_id
        AND g.author_id = auth.uid()
    )
  );

-- Normalize table grants so anon/authenticated roles have only the privileges
-- each RLS surface actually needs.
REVOKE ALL ON TABLE public.admin_users FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_users TO service_role;

REVOKE ALL ON TABLE public.guides FROM anon, authenticated;
GRANT SELECT ON TABLE public.guides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guides TO authenticated;
GRANT ALL ON TABLE public.guides TO service_role;

REVOKE ALL ON TABLE public.guide_submissions FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.guide_submissions TO authenticated;
GRANT ALL ON TABLE public.guide_submissions TO service_role;

REVOKE ALL ON TABLE public.user_profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_profiles TO anon, authenticated;
GRANT DELETE ON TABLE public.user_profiles TO authenticated;
GRANT INSERT (
  user_id,
  handle,
  display_name,
  avatar_url,
  bio,
  is_public,
  created_at,
  updated_at
) ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (
  user_id,
  handle,
  display_name,
  avatar_url,
  bio,
  is_public,
  created_at,
  updated_at
) ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;

REVOKE ALL ON TABLE public.user_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_preferences TO authenticated;
GRANT ALL ON TABLE public.user_preferences TO service_role;
