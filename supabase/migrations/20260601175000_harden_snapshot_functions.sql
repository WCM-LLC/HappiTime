-- Security hardening (deliberate prod change — NOT a no-op), paired with Stage 4.
--
-- capture_reference_snapshot + restore_venue_from_snapshot are SECURITY DEFINER (bypass RLS)
-- and were granted to anon/authenticated on prod (out-of-band, captured in 20260601170000),
-- so both were callable via the public REST rpc endpoint. restore_venue_from_snapshot is the
-- serious one: any caller could OVERWRITE an arbitrary venue with snapshot data. capture lets
-- a caller create full snapshots (resource abuse). Neither is referenced in apps/*; they are
-- admin/ops + service_role tooling. Restrict EXECUTE to service_role + owner — same fix and
-- rationale as merge_staging_venues (no in-function is_platform_admin() check, which would
-- break service_role callers that lack auth.uid()).

revoke execute on function public.capture_reference_snapshot(text, text) from public, anon, authenticated;
revoke execute on function public.restore_venue_from_snapshot(uuid, uuid) from public, anon, authenticated;
-- service_role retains its explicit grant (from 20260601170000); owner (postgres) always can.
