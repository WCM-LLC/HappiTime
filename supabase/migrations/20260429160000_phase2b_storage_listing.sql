BEGIN;

-- B) Stop public listing of venue-media bucket while keeping object URL reads working.
--    The bucket is already marked public=true in storage.buckets, so Supabase Storage
--    serves any known object URL directly without an RLS SELECT policy.
--    The two existing SELECT-capable policies on storage.objects only enable listing —
--    drop the pure-SELECT one and narrow the write policy to INSERT/UPDATE/DELETE only.

-- Drop the broad SELECT policy (bucket public=true handles URL reads; listing not needed)
DROP POLICY IF EXISTS venue_media_read_public ON storage.objects;

-- Recreate the write policy as three explicit commands instead of ALL (removes SELECT coverage)
DROP POLICY IF EXISTS venue_media_write_auth ON storage.objects;

CREATE POLICY venue_media_insert_auth ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'venue-media');

CREATE POLICY venue_media_update_auth ON storage.objects
  FOR UPDATE TO authenticated
  USING  (bucket_id = 'venue-media')
  WITH CHECK (bucket_id = 'venue-media');

CREATE POLICY venue_media_delete_auth ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'venue-media');

COMMIT;
