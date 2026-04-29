-- Add source column to venue_media to distinguish owner uploads from scraped images.
-- Backfill uses storage_path prefixes set by scripts/fetch-venue-photos.mjs:
--   website/   -> website scrape
--   places/    -> Google Places API
--   covers/    -> Unsplash fallback
--   anything else -> owner/admin upload

alter table public.venue_media
  add column if not exists source text not null default 'unknown';

update public.venue_media
set source = case
  when storage_path like 'website/%' then 'website'
  when storage_path like 'places/%'  then 'google_places'
  when storage_path like 'covers/%'  then 'unsplash'
  else 'upload'
end
where source = 'unknown';

alter table public.venue_media
  add constraint venue_media_source_check
  check (source in ('upload', 'website', 'google_places', 'unsplash', 'unknown'));

create index if not exists venue_media_source_idx on public.venue_media (venue_id, source);
