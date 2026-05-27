const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'instagr.am', 'www.instagr.am']);
const INSTAGRAM_MEDIA_TYPES = new Set(['p', 'reel', 'tv']);

export function normalizeGuideCoverImageUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) {
    return raw;
  }

  const [mediaType, shortcode] = url.pathname.split('/').filter(Boolean);
  if (!mediaType || !shortcode || !INSTAGRAM_MEDIA_TYPES.has(mediaType.toLowerCase())) {
    return raw;
  }

  return `https://www.instagram.com/${mediaType.toLowerCase()}/${shortcode}/media/?size=l`;
}
