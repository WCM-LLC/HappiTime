-- Migration: Toastmaker attribution — record a user_referrals row when a new
-- user claims a pending friend invite (the inviter referred them).
-- This is a strict superset of the current handle_new_user trigger function;
-- all existing statements are preserved unchanged.

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
