import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeGuideCoverImageUrl } from '@/utils/guide-cover-url';

export const GUIDE_COVER_BUCKET = 'guide-covers';

const MAX_GUIDE_COVER_BYTES = 5 * 1024 * 1024;
const GUIDE_COVER_MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export type GuideCoverUploadErrorCode =
  | 'cover_file_too_large'
  | 'cover_file_type'
  | 'cover_upload_failed';

export class GuideCoverUploadError extends Error {
  constructor(readonly code: GuideCoverUploadErrorCode, message: string) {
    super(message);
    this.name = 'GuideCoverUploadError';
  }
}

function getGuideCoverFile(formData: FormData): File | null {
  const value = formData.get('cover_image_file');
  if (!(value instanceof File) || value.size === 0) return null;
  return value;
}

export async function resolveGuideCoverImageUrl(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData,
): Promise<string | null> {
  const file = getGuideCoverFile(formData);
  if (!file) {
    return normalizeGuideCoverImageUrl(String(formData.get('cover_image_url') ?? ''));
  }

  if (file.size > MAX_GUIDE_COVER_BYTES) {
    throw new GuideCoverUploadError('cover_file_too_large', 'Guide cover image is too large.');
  }

  const extension = GUIDE_COVER_MIME_EXTENSIONS[file.type];
  if (!extension) {
    throw new GuideCoverUploadError('cover_file_type', 'Unsupported guide cover image type.');
  }

  const path = `${userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(GUIDE_COVER_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    throw new GuideCoverUploadError('cover_upload_failed', error.message);
  }

  const { data } = supabase.storage.from(GUIDE_COVER_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
