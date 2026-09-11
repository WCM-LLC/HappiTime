-- RECONSTRUCTED FILE — original was never committed.
--
-- This version is present in prod's `supabase_migrations.schema_migrations` ledger (applied
-- 2026-08-17) but its file was never committed to any branch. `supabase db push` aborts with
-- "Remote migration versions not found in local migrations directory" whenever the remote
-- ledger references a version the repo cannot produce, which is why the deploy pipeline has
-- been broken since 2026-08-17. This file exists so the ledger and the repo agree again.
--
-- WHY THIS ONE IS EMPTY: it was superseded 78 seconds later by
-- 20260817004958_prevent_duplicate_places_id_venues_v2, and its original text is not
-- recoverable — prod only retains the END STATE, which is what v2 produced. Rather than invent
-- a v1 body that never existed, this file is a deliberate no-op that records what happened.
-- The objects this migration was reaching for are created, in their final prod form, by v2.
--
-- This file will never execute against prod (the version is already in prod's ledger, so
-- `db push` skips it). It runs only on a fresh replay, where the no-op is correct.

do $$
begin
  raise notice 'ledger placeholder: superseded by 20260817004958 (see file header)';
end $$;
