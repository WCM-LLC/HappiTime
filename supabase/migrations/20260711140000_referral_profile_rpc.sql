-- Referral landing (https://happitime.biz/r/{handle}) must resolve an Insider's
-- profile even when that Insider's directory profile is private (is_public=false).
--
-- Root cause of the /r/{handle} 404s: the anon directory client reads
-- user_profiles directly, and BOTH the app query and the RLS policy
-- (user_profiles_select_owner_or_public: is_public = true OR user_id = auth.uid())
-- gate on is_public. An Insider who shared their personal link but has a private
-- profile (e.g. handle "1extrababe") was therefore unresolvable → notFound() → 404.
--
-- A referral link is deliberately shared by its owner and only surfaces
-- (handle, display_name, avatar) — the same identity the landing page prints as
-- "invited by …". So resolving a super_user regardless of is_public is the intended
-- behavior, not a privacy leak. This SECURITY DEFINER RPC bypasses the anon RLS
-- gate for exactly that minimal column set, WITHOUT altering anyone's is_public bit
-- and WITHOUT broadening the table-wide anon SELECT policy.
--
-- The predicate is a strict SUPERSET of today's behavior: every currently-working
-- link (any is_public=true row, including regular users) keeps working; the only
-- rows newly resolvable are private super_users. Private regular users stay hidden.
create or replace function public.get_referral_profile(p_handle text)
returns table (handle text, display_name text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select up.handle, up.display_name, up.avatar_url
  from public.user_profiles up
  -- Normalize like the client + record_referral: strip leading @, lowercase.
  -- Exact match (not ILIKE) avoids the '_' single-char wildcard pitfall.
  where up.handle = lower(regexp_replace(p_handle, '^@', ''))
    and (up.is_public = true or up.role = 'super_user')
  limit 1;
$$;

revoke all on function public.get_referral_profile(text) from public;
grant execute on function public.get_referral_profile(text) to anon, authenticated;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- drop function if exists public.get_referral_profile(text);
