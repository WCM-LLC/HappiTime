-- Storage bucket + MVP policies for venue media uploads.
-- Uses storage.objects RLS (policies are permissive by design for MVP).

insert into storage.buckets (id, name, public)
values ('venue-media', 'venue-media', true)
on conflict (id) do nothing;

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

