const DEFAULT_CONSOLE_ORIGIN = 'https://happitime-console.vercel.app';
const MARKETING_HOSTS = new Set(['happitime.biz', 'www.happitime.biz']);

function normalizeOrigin(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).origin.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isMarketingOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    return MARKETING_HOSTS.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function originFromHeaders(h: Headers): string | null {
  const explicitOrigin = normalizeOrigin(h.get('origin'));
  if (explicitOrigin) return explicitOrigin;

  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return normalizeOrigin(`${proto}://${host}`);
}

export function resolveConsoleOrigin(h?: Headers): string {
  const envOrigin =
    normalizeOrigin(process.env.NEXT_PUBLIC_CONSOLE_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeOrigin(process.env.VERCEL_URL);

  if (envOrigin && !isMarketingOrigin(envOrigin)) return envOrigin;

  const headerOrigin = h ? originFromHeaders(h) : null;
  if (headerOrigin && !isMarketingOrigin(headerOrigin)) return headerOrigin;

  if (process.env.NODE_ENV === 'development') {
    return headerOrigin ?? envOrigin ?? 'http://localhost:3000';
  }

  return DEFAULT_CONSOLE_ORIGIN;
}

export function buildPasswordRecoveryRedirectTo(origin: string): string {
  const url = new URL('/auth/recovery', origin);
  url.searchParams.set('type', 'recovery');
  url.searchParams.set('next', '/reset-password');
  return url.toString();
}
