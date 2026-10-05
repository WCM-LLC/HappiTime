-- Reserved display names.
-- Handles already have reserved_handles + check_reserved_handle(); display_name
-- had no guard. This adds a separate (much shorter) list, because the handle
-- list is too broad for free-text names (it would block "Juan", "Denver", etc).
--
-- Matching: case-, space- and punctuation-insensitive exact match, so
-- "Support", " SUPPORT ", "support." and "S-u-p-p-o-r-t" are all blocked,
-- while "Support Squad" or "Christina" are not.

CREATE TABLE IF NOT EXISTS public.reserved_display_names (
  name       text PRIMARY KEY,           -- stored normalized (see below)
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Read only through SECURITY DEFINER functions; no client access.
ALTER TABLE public.reserved_display_names ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.normalize_display_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.is_reserved_display_name(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reserved_display_names
    WHERE name = public.normalize_display_name_key(p_name)
  );
$$;

INSERT INTO public.reserved_display_names (name) VALUES
  ('support')
ON CONFLICT (name) DO NOTHING;

-- Block user writes of a reserved display name. The message is human-readable
-- on purpose: the mobile Profile screen shows error.message verbatim, so this
-- works in already-shipped app builds without a release.
CREATE OR REPLACE FUNCTION public.check_reserved_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Admin back-office / seeding may set anything (mirrors check_reserved_handle).
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.display_name IS NOT NULL
     AND public.is_reserved_display_name(NEW.display_name) THEN
    RAISE EXCEPTION 'That display name is reserved. Please choose a different name.'
      USING ERRCODE = 'check_violation',
            DETAIL  = NEW.display_name || ' is a reserved display name',
            HINT    = 'display_name_reserved';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_check_reserved_display_name ON public.user_profiles;
CREATE TRIGGER user_profiles_check_reserved_display_name
  BEFORE INSERT OR UPDATE OF display_name ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_reserved_display_name();

-- Signup seeding: handle_new_user() derives display_name from the email prefix
-- when full_name/display_name metadata is absent (e.g. support@company.com ->
-- "support"). Without this, the trigger above would make those signups fail.
-- If the derived name is reserved, fall back to first_name + last_name, then NULL.
-- Body is otherwise identical to the prod definition as of 2026-09-30.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite RECORD;
  v_display_name text;
BEGIN
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'display_name',
    NULLIF(SPLIT_PART(NEW.email, '@', 1), '')
  );

  IF public.is_reserved_display_name(v_display_name) THEN
    v_display_name := NULLIF(BTRIM(CONCAT_WS(' ',
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'last_name'
    )), '');
    IF public.is_reserved_display_name(v_display_name) THEN
      v_display_name := NULL;
    END IF;
  END IF;

  -- Seed profile (is_public default is now true per column default)
  INSERT INTO public.user_profiles (user_id, display_name, handle, is_public)
  VALUES (
    NEW.id,
    v_display_name,
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

    -- Toastmaker attribution: the inviter referred this user (first-wins per PK).
    insert into public.user_referrals (referee_user_id, referrer_user_id, referrer_handle, source)
    values (
      NEW.id,
      v_invite.inviter_id,
      (select handle from public.user_profiles where user_id = v_invite.inviter_id),
      'invite'
    )
    on conflict (referee_user_id) do nothing;
  END LOOP;

  RETURN NEW;
END;
$function$;
