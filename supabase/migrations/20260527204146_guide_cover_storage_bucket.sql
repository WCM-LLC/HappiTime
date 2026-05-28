-- Public guide cover images uploaded from the guide editor.
--
-- The bucket is public so known object URLs can render in the public directory,
-- but there is intentionally no SELECT policy on storage.objects. That keeps
-- bucket listing closed while public object URLs continue to work.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guide-covers',
  'guide-covers',
  true,
  5242880,
  ARRAY['image/avif', 'image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS guide_covers_insert_own ON storage.objects;
DROP POLICY IF EXISTS guide_covers_update_own ON storage.objects;
DROP POLICY IF EXISTS guide_covers_delete_own ON storage.objects;

CREATE POLICY guide_covers_insert_own
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'guide-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY guide_covers_update_own
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'guide-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'guide-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY guide_covers_delete_own
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'guide-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
