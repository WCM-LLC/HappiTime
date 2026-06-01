-- Reconciled into the repo from the remote ledger (version 20260529112844): this
-- migration was applied to prod (ujflcrjsiyhofnomurco) but missing from the repo.
-- SQL below is the exact statement recorded in supabase_migrations.schema_migrations.

INSERT INTO approved_tags (slug, label, category, sort_order, is_active)
VALUES ('latinx-owned', 'LatinX-Owned', 'feature', 60, true)
ON CONFLICT (slug) DO NOTHING;
