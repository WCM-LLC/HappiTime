-- Avatar storage bucket for user profile photos.
-- Depends on: (none — storage schema is pre-existing)
--
-- bucket public=true: Supabase Storage serves object URLs directly without an
-- RLS SELECT policy (same pattern as venue-media after phase2b hardening).
-- Storage object policies restrict write access to each user's own uid/ prefix.

-- ── 1. Bucket ────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  1048576,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Storage object policies ───────────────────────────────────────────────

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;

-- Authenticated users may only upload into their own uid/ prefix.
CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_update_own"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING  (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_delete_own"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
