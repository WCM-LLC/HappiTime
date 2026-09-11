// Shared notice/error copy for the guide authoring surfaces. The list page and
// the /new editor both receive these codes via redirect query params.

export const GUIDE_NOTICE: Record<string, string> = {
  draft_saved: 'Draft saved.',
  draft_deleted: 'Draft deleted.',
  guide_submitted: 'Guide submitted for review.',
  guide_published: 'Guide published.',
};

export const GUIDE_ERRORS: Record<string, string> = {
  title_required: 'A title is required.',
  body_required: 'Add some body text before saving.',
  save_failed: 'Save failed — try again.',
  submit_failed: 'Submit failed — try again.',
  delete_failed: 'Delete failed — try again.',
  guide_not_found: 'Guide not found.',
  already_published: 'This guide is already published.',
  missing_guide_id: 'No guide selected.',
  not_authorized: 'You need Super User access to author guides.',
  cover_file_too_large: 'Cover image must be 5 MB or smaller.',
  cover_file_type: 'Cover image must be AVIF, WebP, JPG, or PNG.',
  cover_upload_failed: 'Cover image upload failed — try again.',
};
