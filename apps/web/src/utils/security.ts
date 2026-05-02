const DEFAULT_APP_ORIGIN = 'https://www.happitime.biz';

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(): Set<string> {
  const raw = process.env.APP_ALLOWED_ORIGINS ?? DEFAULT_APP_ORIGIN;
  const origins = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter((item): item is string => !!item);

  if (origins.length === 0) {
    return new Set([DEFAULT_APP_ORIGIN]);
  }

  return new Set(origins);
}

export function getSafeAppOrigin(originHeader: string | null): string {
  const allowed = getAllowedOrigins();
  const normalized = originHeader ? normalizeOrigin(originHeader) : null;
  if (normalized && allowed.has(normalized)) {
    return normalized;
  }
  return [...allowed][0] ?? DEFAULT_APP_ORIGIN;
}

export function isAllowedOrigin(originHeader: string | null): boolean {
  const normalized = originHeader ? normalizeOrigin(originHeader) : null;
  if (!normalized) return false;
  return getAllowedOrigins().has(normalized);
}

export function isTrustedBrowserRequest(headers: Headers): boolean {
  const origin = headers.get('origin');
  if (!isAllowedOrigin(origin)) return false;

  const fetchSite = headers.get('sec-fetch-site');
  if (!fetchSite) return true;
  return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
}
