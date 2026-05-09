'use server';

import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';

const CLOUD_NAME = 'dhucspghz';

export async function deleteCloudinaryAsset(
  mediaId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  const mediaSelect = async (table: 'venue_media' | 'media_assets') =>
    supabase
      .from(table)
      .select('storage_bucket,storage_path')
      .eq('id', mediaId)
      .maybeSingle();

  let rowResult = await mediaSelect('venue_media');
  if (rowResult.error && String(rowResult.error.code ?? '') === '42P01') {
    rowResult = await mediaSelect('media_assets');
  }
  if (rowResult.error || !rowResult.data) {
    return { error: 'Media not found or not authorized' };
  }

  const { storage_bucket: storageBucket, storage_path: publicId } = rowResult.data;
  if (storageBucket !== 'cloudinary') {
    return { error: 'Invalid storage bucket for Cloudinary delete' };
  }
  if (!publicId.startsWith('happitime/venues/')) {
    return { error: 'Invalid Cloudinary public ID' };
  }

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('[media] CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET not set');
    return { error: 'Cloudinary credentials not configured on server' };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature,
  });

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return { error: `Cloudinary destroy failed (${res.status}): ${text}` };
  }

  const json = (await res.json()) as { result?: string };
  if (json.result !== 'ok' && json.result !== 'not found') {
    return { error: `Cloudinary destroy result: ${json.result}` };
  }

  return { error: null };
}
