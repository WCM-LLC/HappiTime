-- Super-user author socials + onboarding banner dismissal
alter table user_profiles
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists website_url text,
  add column if not exists youtube_url text,
  add column if not exists socials_prompt_dismissed_at timestamptz;

-- The lockdown migration (20260519120000) REVOKEd UPDATE from authenticated and
-- re-granted it only on an allowlist of columns. Column-level privilege sits under
-- RLS, so without an explicit grant here the owner-update policy is not enough:
-- saveProfileSocials / dismissSocialsPrompt (run as the authenticated role) would
-- fail with "permission denied for column". Grant UPDATE on the new user-writable
-- columns to keep those actions working. No INSERT grant needed (actions only update).
grant update (
  instagram_url,
  tiktok_url,
  website_url,
  youtube_url,
  socials_prompt_dismissed_at
) on public.user_profiles to authenticated;

-- Public read surface for guide-author bylines. Exposes ONLY name/avatar/socials,
-- and ONLY for users who have >=1 published guide. Keyed on published guides, NOT
-- is_public, so a private-profile super user still gets a byline.
create or replace view public_guide_authors
with (security_invoker = off) as
  select
    up.user_id as author_id,
    up.display_name,
    up.avatar_url,
    up.instagram_url,
    up.tiktok_url,
    up.website_url,
    up.youtube_url
  from user_profiles up
  where exists (
    select 1 from guides g
    where g.author_id = up.user_id
      and g.status = 'published'
  );

grant select on public_guide_authors to anon, authenticated;
