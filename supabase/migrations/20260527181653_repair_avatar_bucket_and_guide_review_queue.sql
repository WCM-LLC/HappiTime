-- Repair two production-facing drifts:
-- 1. user-avatars may already exist as private in older environments, while
--    mobile stores public avatar URLs with getPublicUrl().
-- 2. If a guide submission audit row exists for a draft guide, the admin queue
--    should still surface it as pending review.

UPDATE storage.buckets
SET public = true,
    file_size_limit = 1048576,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png']
WHERE id = 'user-avatars';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  1048576,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Existing submitted drafts were invisible to the admin pending tab because
-- the admin queue is status-based. Promote only unresolved author submissions.
UPDATE public.guides g
SET status = 'pending_review',
    updated_at = now()
WHERE g.status = 'draft'
  AND EXISTS (
    SELECT 1
    FROM public.guide_submissions gs
    WHERE gs.guide_id = g.id
      AND gs.submitted_by IS NOT NULL
      AND gs.decision IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.guide_submissions gs
    WHERE gs.guide_id = g.id
      AND gs.reviewed_at IS NOT NULL
      AND gs.decision IN ('approved', 'rejected', 'unpublished')
  );

CREATE OR REPLACE FUNCTION app_private.ensure_guide_pending_on_submission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app_private
AS $$
BEGIN
  IF NEW.submitted_by IS NOT NULL AND NEW.decision IS NULL THEN
    UPDATE public.guides
    SET status = 'pending_review',
        updated_at = now()
    WHERE id = NEW.guide_id
      AND status = 'draft';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.ensure_guide_pending_on_submission() FROM PUBLIC;

DROP TRIGGER IF EXISTS guide_submissions_promote_pending_review ON public.guide_submissions;
CREATE TRIGGER guide_submissions_promote_pending_review
  AFTER INSERT ON public.guide_submissions
  FOR EACH ROW
  EXECUTE FUNCTION app_private.ensure_guide_pending_on_submission();
