'use server';

import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';

const DEFAULT_CLOUDINARY_CLOUD_NAME = 'dhucspghz';

type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function parseCloudinaryUrl(value: string | undefined): Partial<CloudinaryCredentials> {
  if (!value) return {};

  try {
    const url = new URL(value);
    if (url.protocol !== 'cloudinary:') return {};

    return {
      cloudName: decodeURIComponent(url.hostname),
      apiKey: decodeURIComponent(url.username),
      apiSecret: decodeURIComponent(url.password),
    };
  } catch {
    return {};
  }
}

function getCloudinaryCredentials(): CloudinaryCredentials | null {
  const urlCredentials = parseCloudinaryUrl(process.env.CLOUDINARY_URL);
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ??
    urlCredentials.cloudName ??
    DEFAULT_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY ?? urlCredentials.apiKey;
  const apiSecret = process.env.CLOUDINARY_API_SECRET ?? urlCredentials.apiSecret;

  if (!apiKey || !apiSecret) return null;

  return { cloudName, apiKey, apiSecret };
}

function getCloudinaryResourceType(mediaType: string | null): 'image' | 'video' | 'raw' {
  if (mediaType === 'video') return 'video';
  if (mediaType === 'menu_pdf') return 'raw';
  return 'image';
}

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
      .select('storage_bucket,storage_path,type')
      .eq('id', mediaId)
      .maybeSingle();

  let rowResult = await mediaSelect('venue_media');
  if (rowResult.error && String(rowResult.error.code ?? '') === '42P01') {
    rowResult = await mediaSelect('media_assets');
  }
  if (rowResult.error || !rowResult.data) {
    return { error: 'Media not found or not authorized' };
  }

  const {
    storage_bucket: storageBucket,
    storage_path: publicId,
    type: mediaType,
  } = rowResult.data;
  if (storageBucket !== 'cloudinary') {
    return { error: 'Invalid storage bucket for Cloudinary delete' };
  }
  if (!publicId.startsWith('happitime/venues/')) {
    return { error: 'Invalid Cloudinary public ID' };
  }

  const credentials = getCloudinaryCredentials();

  if (!credentials) {
    console.error('[media] Cloudinary server credentials not set');
    return {
      error:
        'Cloudinary credentials not configured on server. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, or CLOUDINARY_URL.',
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${timestamp}${credentials.apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');
  const resourceType = getCloudinaryResourceType(mediaType);

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: credentials.apiKey,
    signature,
  });

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${credentials.cloudName}/${resourceType}/destroy`,
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
