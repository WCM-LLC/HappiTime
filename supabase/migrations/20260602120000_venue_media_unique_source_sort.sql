-- Prevent duplicate venue media from concurrent import-places runs.
--
-- Root cause: `import-places`' refreshVenueMedia does delete-then-insert with no DB-level
-- uniqueness. Two overlapping invocations both passed the delete guard and each inserted a full
-- set of google_places photos, doubling every image (observed: 18 venues, 12 rows = 6 images x 2,
-- all inserted within ~59ms). This constraint makes the second writer's insert conflict instead of
-- duplicating; import-places upserts with ignoreDuplicates so the race loser no-ops cleanly.
--
-- Safe to apply: prod was deduped to 0 collisions on (venue_id, source, sort_order) before this
-- migration, and every venue_media row has a non-null sort_order across all sources.
-- Idempotent (DO-block guard) so a clean replay and prod converge to the same state.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.venue_media'::regclass
      and conname = 'venue_media_venue_source_sort_key'
  ) then
    alter table public.venue_media
      add constraint venue_media_venue_source_sort_key
      unique (venue_id, source, sort_order);
  end if;
end $$;
