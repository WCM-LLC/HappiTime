const DEFAULT_APP_ORIGIN = 'https://www.happitime.biz';

/** Parses the origin (scheme + host + port) from a URL string; returns null if malformed. */
function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Builds the set of allowed origins from APP_ALLOWED_ORIGINS; falls back to happitime.biz. */
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

/** Returns the caller's origin if it's in the allowlist; otherwise returns the first allowed origin. */
export function getSafeAppOrigin(originHeader: string | null): string {
  const allowed = getAllowedOrigins();
  const normalized = originHeader ? normalizeOrigin(originHeader) : null;
  if (normalized && allowed.has(normalized)) {
    return normalized;
  }
  return [...allowed][0] ?? DEFAULT_APP_ORIGIN;
}

/** Returns true when the given Origin header is in the configured allowlist. */
export function isAllowedOrigin(originHeader: string | null): boolean {
  const normalized = originHeader ? normalizeOrigin(originHeader) : null;
  if (!normalized) return false;
  return getAllowedOrigins().has(normalized);
}

/**
 * Returns true for browser-initiated same-origin/same-site requests.
 * Used to distinguish trusted first-party fetches from direct API calls.
 */
export function isTrustedBrowserRequest(headers: Headers): boolean {
  const origin = headers.get('origin');
  if (!isAllowedOrigin(origin)) return false;

  const fetchSite = headers.get('sec-fetch-site');
  if (!fetchSite) return true;
  return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
}
