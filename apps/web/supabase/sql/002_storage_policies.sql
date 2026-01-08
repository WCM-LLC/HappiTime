-- Storage bucket + simple policies for MVP.
-- WARNING: This is intentionally permissive for speed. Tighten later.

-- Create the bucket (public = true makes it easy to render images/videos in the user app)
insert into storage.buckets (id, name, public)
values ('venue-media', 'venue-media', true)
on conflict (id) do nothing;

-- Allow authenticated users full access to objects in this bucket (MVP).
-- Replace with org/venue-aware policies later.
drop policy if exists "venue_media_read_public" on storage.objects;
drop policy if exists "venue_media_write_auth" on storage.objects;

create policy "venue_media_read_public"
on storage.objects
for select
to public
using (bucket_id = 'venue-media');

create policy "venue_media_write_auth"
on storage.objects
for all
to authenticated
using (bucket_id = 'venue-media')
with check (bucket_id = 'venue-media');
