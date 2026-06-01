-- Reconciled into the repo from the remote ledger (version 20260529113148): this
-- migration was applied to prod (ujflcrjsiyhofnomurco) but missing from the repo.
-- SQL below is the exact statement recorded in supabase_migrations.schema_migrations.

-- 1. Relabel LatinX -> Latinx
UPDATE approved_tags SET label = 'Latinx-Owned' WHERE slug = 'latinx-owned';

-- 2. Shift existing feature tags at 54-59 down to 55-60 to make room at 54
UPDATE approved_tags SET sort_order = sort_order + 1
WHERE category = 'feature' AND sort_order BETWEEN 54 AND 59;

-- 3. Slot latinx-owned in at 54, adjacent to the other ownership tags (50-53)
UPDATE approved_tags SET sort_order = 54 WHERE slug = 'latinx-owned';
