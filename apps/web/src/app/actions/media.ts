'use server';

import crypto from 'crypto';

const CLOUD_NAME = 'dhucspghz';

export async function deleteCloudinaryAsset(
  publicId: string
): Promise<{ error: string | null }> {
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
