BEGIN;

-- D) Revoke anon EXECUTE on SECURITY DEFINER RLS helper functions.
--    These 6 functions are called only from WITHIN RLS policies on authenticated-only
--    operations (venue/org ownership/membership checks). No anon-facing RLS policy
--    invokes them — verified by auditing all public.* policies for anon/public roles.
--
--    Two-step revoke required because these functions had BOTH a PUBLIC grant AND
--    explicit individual grants to each role (anon=X/postgres in proacl).
--    REVOKE FROM PUBLIC removes the PUBLIC inheritance but leaves explicit grants intact.
--    REVOKE FROM anon removes the explicit anon grant.
--    Correct pattern: REVOKE FROM PUBLIC + REVOKE FROM anon, then re-GRANT to authenticated.

REVOKE EXECUTE ON FUNCTION public.get_venue_follower_user_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_venue_assignment(uuid)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_host(uuid)                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_manager(uuid)                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid)                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(uuid)                   FROM PUBLIC;

-- Also revoke explicit individual anon grants (survived REVOKE FROM PUBLIC on prod).
REVOKE EXECUTE ON FUNCTION public.get_venue_follower_user_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_venue_assignment(uuid)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_host(uuid)                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_manager(uuid)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid)                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(uuid)                   FROM anon;

-- Re-grant to authenticated so RLS policies for signed-in users continue to work.
-- anon is intentionally excluded — no anon-facing RLS policy calls these helpers.
GRANT EXECUTE ON FUNCTION public.get_venue_follower_user_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_venue_assignment(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_host(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_manager(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid)                   TO authenticated;

COMMIT;
