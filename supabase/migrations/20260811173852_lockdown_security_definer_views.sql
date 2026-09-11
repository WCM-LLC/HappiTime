-- Lock down the two SECURITY DEFINER views flagged by the Supabase security
-- advisor (security_definer_view, level ERROR). Verified state before this
-- migration: both views carried ALL privileges (arwdDxtm) for anon and
-- authenticated via default privileges, with definer rights bypassing RLS.
--
-- 1) toastmaker_scores — internal scoring surface. Its only legitimate reader
--    is toastmaker_nominee(), which is SECURITY DEFINER and org-gated, so the
--    view itself needs no client access and no RLS bypass of its own. Before
--    this migration any authenticated (or anon) client could SELECT per-user
--    check-in counts and referral attribution across all venues.
alter view public.toastmaker_scores set (security_invoker = on);
revoke all on public.toastmaker_scores from anon, authenticated;

-- 2) public_guide_authors — intentional definer READ surface for guide-author
--    bylines (see 20260707120000_user_profile_socials.sql). It stays
--    SECURITY DEFINER by design, but it is auto-updatable (single-table view),
--    so the inherited ALL grant let anon INSERT/UPDATE/DELETE user_profiles
--    rows through it, bypassing RLS. Strip everything except SELECT.
revoke all on public.public_guide_authors from anon, authenticated;
grant select on public.public_guide_authors to anon, authenticated;
