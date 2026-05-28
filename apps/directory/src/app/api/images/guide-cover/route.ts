import { NextRequest, NextResponse } from 'next/server';
import { normalizeGuideCoverImageUrl } from '@/lib/guideCoverUrl';

export const runtime = 'nodejs';

const MAX_REDIRECTS = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/avif', 'image/webp', 'image/jpeg', 'image/png', 'image/gif']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isPrivateHostname(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }
  if (host === '::1' || host.includes(':')) return true;

  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function parseAllowedImageUrl(value: string | null) {
  if (!value) return null;
  const normalized = normalizeGuideCoverImageUrl(value);
  if (!normalized) return null;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol) || isPrivateHostname(url.hostname)) {
    return null;
  }
  return url;
}

async function fetchImage(url: URL, redirects = 0): Promise<Response> {
  if (redirects > MAX_REDIRECTS || isPrivateHostname(url.hostname)) {
    throw new Error('Blocked image URL');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.5',
        'user-agent': 'HappiTime image optimizer',
      },
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Image redirect missing location');
      return fetchImage(new URL(location, url), redirects + 1);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const url = parseAllowedImageUrl(request.nextUrl.searchParams.get('url'));
  if (!url) return NextResponse.json({ error: 'invalid_image_url' }, { status: 400 });

  try {
    const response = await fetchImage(url);
    if (!response.ok) {
      return NextResponse.json({ error: 'image_fetch_failed' }, { status: 502 });
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!IMAGE_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'unsupported_image_type' }, { status: 415 });
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
    }

    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
    }

    return new NextResponse(body, {
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      },
    });
  } catch (error) {
    console.error('[guide-cover-image] fetch failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'image_fetch_failed' }, { status: 502 });
  }
}
