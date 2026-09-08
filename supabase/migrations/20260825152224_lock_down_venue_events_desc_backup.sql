-- RECONSTRUCTED FILE — original was never committed (see
-- 20260817004840_prevent_duplicate_places_id_venues.sql for the full explanation).
--
-- Locks down `_venue_events_desc_backup_20260817`, a 2026-08-17 snapshot of
-- venue_events(id, description) taken before a bulk description edit.
--
-- NOTE ON THE TABLE ITSELF: no ledger version corresponds to CREATING it — the snapshot was
-- taken out-of-band by an ad-hoc script, and only this lock-down step was ever run as a
-- migration. On a fresh replay the table therefore does not exist yet when this migration runs,
-- so it is created here (empty) before the RLS and grants are applied. On prod the create is a
-- no-op and, in any case, this file never executes there.
--
-- Prod state reproduced: RLS enabled with NO policies (deny-all to every non-superuser role),
-- ACL `postgres=arwdDxtm/postgres | service_role=arwdDxtm/postgres`.
--
-- Idempotent. Never executes against prod (version already in prod's ledger).

create table if not exists public._venue_events_desc_backup_20260817 (
  id          uuid,
  description text
);

alter table public._venue_events_desc_backup_20260817 enable row level security;

revoke all on table public._venue_events_desc_backup_20260817 from public, anon, authenticated;
grant all  on table public._venue_events_desc_backup_20260817 to service_role;
