-- RECONSTRUCTED FILE — original was never committed (see
-- 20260817004840_prevent_duplicate_places_id_venues.sql for the full explanation).
--
-- Reproduces prod's ACL on the SECURITY DEFINER guard: `postgres=X/postgres |
-- service_role=X/postgres`. PUBLIC, anon and authenticated hold no EXECUTE. A fresh replay
-- would otherwise grant PUBLIC by default, leaving the replica MORE permissive than prod on a
-- SECURITY DEFINER function.
--
-- Idempotent. Never executes against prod (version already in prod's ledger).

revoke all on function public.venues_block_duplicate_places_id() from public, anon, authenticated;
grant execute on function public.venues_block_duplicate_places_id() to service_role;
