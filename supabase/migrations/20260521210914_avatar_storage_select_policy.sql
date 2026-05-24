-- Add SELECT policy for user-avatars bucket.
--
-- The bucket is public=true so unauthenticated CDN reads work without a policy.
-- However the JS SDK queries storage.objects via PostgREST, which enforces RLS.
-- Without a SELECT policy, upsert: true cannot verify whether an existing object
-- is owned by the uploading user, causing a policy violation on the second upload.

DROP POLICY IF EXISTS "avatars_select_own" ON storage.objects;

CREATE POLICY "avatars_select_own"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
