-- Security hardening (deliberate prod change — NOT a no-op reconciliation).
--
-- public.merge_staging_venues is SECURITY DEFINER (runs as owner, bypasses RLS) and was
-- granted to anon + authenticated on prod (out-of-band), so it was callable via the public
-- REST API (POST /rest/v1/rpc/merge_staging_venues with the anon key) — letting a non-admin
-- force a merge of pending staged venues, bypassing the admin review workflow. Surfaced when
-- Stage 3 captured prod's grants into version control (the Layer-4 review gate working).
--
-- Nothing in the app calls this function (verified: no references in apps/*); it is invoked
-- by the ingest pipeline (service_role) or by an admin (postgres). So we restrict EXECUTE to
-- service_role + owner. We do NOT add an in-function is_platform_admin() check: that keys off
-- auth.uid(), which the service_role pipeline caller does not have, so it would break the
-- legitimate caller. Grant-tightening closes the exposure without that risk.
--
-- Note the default PUBLIC execute grant (auto-granted on function creation) must be revoked
-- too — anon/authenticated are members of PUBLIC.

revoke execute on function public.merge_staging_venues(text, boolean) from public, anon, authenticated;
-- service_role retains its explicit grant (from 20260601150000); owner (postgres) always can.
