-- Schema-drift back-fill (3 of 3): capture the leftover table `_venue_events_desc_backup_20260817`.
--
-- Created out-of-band on prod and never committed; see the header of
-- 20260908190000_capture_venues_normalize_tags.sql for the full context.
--
-- WHAT THIS IS: a 2026-08-17 snapshot of `venue_events (id, description)` taken before a bulk
-- description edit. It is NOT redundant — as of this migration 53 of its 197 rows still differ
-- from the live `venue_events.description`, so it is the only surviving record of those
-- pre-edit values. That is why this migration CAPTURES it rather than dropping it.
--
-- THIS TABLE IS TEMPORARY AND SHOULD BE RETIRED. It is captured here only so a clean replay
-- reproduces prod and the `schema-parity` gate can go green. Retiring it is a separate,
-- destructive decision: export the 53 differing rows first, then land a forward migration that
-- drops the table. Do not drop it by editing this file — migrations are append-only.
--
-- The replay creates it EMPTY; parity compares schema objects, not rows.
--
-- IDEMPOTENT / no-op on prod.

create table if not exists public._venue_events_desc_backup_20260817 (
  id          uuid,
  description text
);

-- Prod has RLS enabled with NO policies, i.e. deny-all to every non-superuser role. Reproduce
-- that exactly; a fresh replay would otherwise leave the table wide open to PostgREST.
alter table public._venue_events_desc_backup_20260817 enable row level security;

-- Prod ACL is `postgres=arwdDxtm/postgres | service_role=arwdDxtm/postgres` — anon and
-- authenticated hold nothing. Supabase's default privileges would grant them access on a
-- fresh replay, so revoke explicitly.
revoke all on table public._venue_events_desc_backup_20260817 from public, anon, authenticated;
grant all  on table public._venue_events_desc_backup_20260817 to service_role;
