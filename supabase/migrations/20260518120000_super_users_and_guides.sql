-- Super Users, Guides, Pending Friend Invites: schema foundation.
-- Depends on: 20260108072000_mobile_user_accounts.sql, 20260429120000_admin_users.sql,
--             20260515151616_mobile_onboarding_state.sql

-- ── 1. user_profiles: role + auto_publish_enabled ───────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'super_user')),
  ADD COLUMN IF NOT EXISTS auto_publish_enabled boolean NOT NULL DEFAULT false;

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS user_profiles_role_idx
  ON public.user_profiles (role)
  WHERE role = 'super_user';

CREATE INDEX IF NOT EXISTS user_profiles_handle_prefix_idx
  ON public.user_profiles (handle text_pattern_ops);

-- ── 3. is_public: change default to true, backfill existing rows ────────────
-- (Default first so concurrent inserts during the backfill window get the new default.)

ALTER TABLE public.user_profiles
  ALTER COLUMN is_public SET DEFAULT true;

UPDATE public.user_profiles
SET is_public = true
WHERE is_public = false;

-- ── 4. reserved_handles table ────────────────────────────────────────────────
-- Service-role-only. The DB trigger (step 14) reads from this table.
-- The application reserved-handle list (PR 3) will populate it.

CREATE TABLE IF NOT EXISTS public.reserved_handles (
  handle text PRIMARY KEY
);

ALTER TABLE public.reserved_handles DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reserved_handles FROM anon, authenticated;
GRANT ALL ON public.reserved_handles TO service_role;

-- ── 5. guides table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guides (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text        UNIQUE NOT NULL,
  title          text        NOT NULL,
  subtitle       text,
  cover_image_url text,
  body_md        text        NOT NULL,
  author_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status         text        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  city           text,
  neighborhood   text,
  tags           text[]      NOT NULL DEFAULT '{}',
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guides_status_idx ON public.guides (status);
CREATE INDEX IF NOT EXISTS guides_author_id_idx ON public.guides (author_id);

DROP TRIGGER IF EXISTS guides_set_updated_at ON public.guides;
CREATE TRIGGER guides_set_updated_at
  BEFORE UPDATE ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. guide_submissions table (approval audit log) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.guide_submissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id     uuid        NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  submitted_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  decision     text        CHECK (decision IN ('approved', 'rejected', 'unpublished')),
  notes        text
);

CREATE INDEX IF NOT EXISTS guide_submissions_guide_id_idx ON public.guide_submissions (guide_id);
CREATE INDEX IF NOT EXISTS guide_submissions_submitted_by_idx ON public.guide_submissions (submitted_by);

-- ── 7. pending_friend_invites table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pending_friend_invites (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_handle text,
  invitee_email  text        NOT NULL,
  status         text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'claimed', 'expired', 'cancelled')),
  invite_token   uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  claimed_at     timestamptz,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS pfi_invitee_email_pending_idx
  ON public.pending_friend_invites (lower(invitee_email))
  WHERE status = 'pending';

-- ── 8. onboarding step: add 'handle' between 'notifications' and 'profile' ──

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
      'handle',
      'profile',
      'complete'
    )
  );

-- ── 9. is_happitime_admin() security-definer helper ─────────────────────────
-- Used in RLS policies on guides / guide_submissions.
-- SECURITY DEFINER allows access to admin_users (no public grant on that table).

CREATE OR REPLACE FUNCTION public.is_happitime_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE lower(email) = lower(auth.email())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_happitime_admin() TO authenticated;

-- ── 10. RLS: guides ──────────────────────────────────────────────────────────

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

-- Anon + authenticated: see published guides
DROP POLICY IF EXISTS "guides_select_published" ON public.guides;
CREATE POLICY "guides_select_published"
  ON public.guides FOR SELECT
  USING (status = 'published');

-- Authenticated authors: see all of their own guides (any status)
DROP POLICY IF EXISTS "guides_select_own" ON public.guides;
CREATE POLICY "guides_select_own"
  ON public.guides FOR SELECT
  USING (author_id = auth.uid());

-- Authenticated authors: create new guides (status must be 'draft'; only service-role can publish)
DROP POLICY IF EXISTS "guides_insert_own" ON public.guides;
CREATE POLICY "guides_insert_own"
  ON public.guides FOR INSERT
  WITH CHECK (author_id = auth.uid() AND status = 'draft');

-- Authenticated authors: update their own guides (status cannot be moved to 'published' directly)
DROP POLICY IF EXISTS "guides_update_own" ON public.guides;
CREATE POLICY "guides_update_own"
  ON public.guides FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (
    author_id = auth.uid()
    AND status IN ('draft', 'pending_review', 'archived')
  );

-- Authenticated authors: delete their own draft guides
DROP POLICY IF EXISTS "guides_delete_own" ON public.guides;
CREATE POLICY "guides_delete_own"
  ON public.guides FOR DELETE
  USING (author_id = auth.uid());

-- Admins: unrestricted access
DROP POLICY IF EXISTS "guides_admin_all" ON public.guides;
CREATE POLICY "guides_admin_all"
  ON public.guides FOR ALL
  USING (public.is_happitime_admin())
  WITH CHECK (public.is_happitime_admin());

-- ── 11. RLS: guide_submissions ───────────────────────────────────────────────

ALTER TABLE public.guide_submissions ENABLE ROW LEVEL SECURITY;

-- Authors see submissions for their own guides
DROP POLICY IF EXISTS "guide_submissions_select_own" ON public.guide_submissions;
CREATE POLICY "guide_submissions_select_own"
  ON public.guide_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.guides g
      WHERE g.id = guide_id
        AND g.author_id = auth.uid()
    )
  );

-- Authors can write a submission row for their own guide
DROP POLICY IF EXISTS "guide_submissions_insert_own" ON public.guide_submissions;
CREATE POLICY "guide_submissions_insert_own"
  ON public.guide_submissions FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.guides g
      WHERE g.id = guide_id
        AND g.author_id = auth.uid()
    )
  );

-- Admins: unrestricted access
DROP POLICY IF EXISTS "guide_submissions_admin_all" ON public.guide_submissions;
CREATE POLICY "guide_submissions_admin_all"
  ON public.guide_submissions FOR ALL
  USING (public.is_happitime_admin())
  WITH CHECK (public.is_happitime_admin());

-- ── 12. RLS: pending_friend_invites ─────────────────────────────────────────

ALTER TABLE public.pending_friend_invites ENABLE ROW LEVEL SECURITY;

-- Inviter sees their own invites
DROP POLICY IF EXISTS "pfi_select_inviter" ON public.pending_friend_invites;
CREATE POLICY "pfi_select_inviter"
  ON public.pending_friend_invites FOR SELECT
  USING (inviter_id = auth.uid());

-- Invitee sees invites addressed to their email
DROP POLICY IF EXISTS "pfi_select_invitee" ON public.pending_friend_invites;
CREATE POLICY "pfi_select_invitee"
  ON public.pending_friend_invites FOR SELECT
  USING (lower(invitee_email) = lower(auth.email()));

-- Authenticated users can create invites as themselves
DROP POLICY IF EXISTS "pfi_insert_own" ON public.pending_friend_invites;
CREATE POLICY "pfi_insert_own"
  ON public.pending_friend_invites FOR INSERT
  WITH CHECK (inviter_id = auth.uid());

-- Inviters can cancel their own pending invites only
DROP POLICY IF EXISTS "pfi_update_cancel" ON public.pending_friend_invites;
CREATE POLICY "pfi_update_cancel"
  ON public.pending_friend_invites FOR UPDATE
  USING (inviter_id = auth.uid() AND status = 'pending')
  WITH CHECK (inviter_id = auth.uid() AND status = 'cancelled');

-- ── 13. Grants ───────────────────────────────────────────────────────────────

GRANT SELECT ON public.guides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guides TO authenticated;

GRANT SELECT, INSERT ON public.guide_submissions TO authenticated;

GRANT SELECT, INSERT ON public.pending_friend_invites TO authenticated;
GRANT UPDATE (status, claimed_at) ON public.pending_friend_invites TO authenticated;

-- ── 14. Reserved handle trigger ──────────────────────────────────────────────
-- Blocks handles present in reserved_handles for non-service-role callers.
-- Service role bypass covers: handle_new_user() (security definer runs in auth
-- service context with service_role JWT), admin back-office writes, migrations.

CREATE OR REPLACE FUNCTION public.check_reserved_handle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role to set any handle (admin back-office, seeding, triggers).
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.handle IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.reserved_handles
      WHERE handle = lower(NEW.handle)
    ) THEN
      RAISE EXCEPTION 'handle_reserved'
        USING DETAIL = NEW.handle || ' is a reserved handle',
              HINT   = 'Choose a different handle';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_check_reserved_handle ON public.user_profiles;
CREATE TRIGGER user_profiles_check_reserved_handle
  BEFORE INSERT OR UPDATE OF handle ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_reserved_handle();

-- ── 15. Extend handle_new_user() ─────────────────────────────────────────────
-- Preserves: seed user_profiles from auth.users metadata.
-- Adds: claim pending_friend_invites matching the new user's email,
--       insert mutual user_follows for each claimed invite.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  -- Seed profile (is_public default is now true per column default)
  INSERT INTO public.user_profiles (user_id, display_name, handle, is_public)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'display_name',
      NULLIF(SPLIT_PART(NEW.email, '@', 1), '')
    ),
    NULLIF(LOWER(NEW.raw_user_meta_data->>'handle'), ''),
    true
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Claim pending invites whose invitee_email matches the new account.
  FOR v_invite IN
    SELECT id, inviter_id
    FROM public.pending_friend_invites
    WHERE lower(invitee_email) = lower(NEW.email)
      AND status = 'pending'
      AND expires_at > now()
  LOOP
    -- Guard: never create a self-follow.
    IF v_invite.inviter_id = NEW.id THEN
      CONTINUE;
    END IF;

    -- Mutual follows: inviter → new user and new user → inviter.
    INSERT INTO public.user_follows (follower_id, following_user_id)
    VALUES (v_invite.inviter_id, NEW.id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_follows (follower_id, following_user_id)
    VALUES (NEW.id, v_invite.inviter_id)
    ON CONFLICT DO NOTHING;

    -- Mark invite claimed.
    UPDATE public.pending_friend_invites
    SET status = 'claimed',
        claimed_at = now()
    WHERE id = v_invite.id;
  END LOOP;

  RETURN NEW;
END;
$$;
