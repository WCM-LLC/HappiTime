const DEFAULT_ADMIN_EMAIL = 'admin@happitime.biz';

function normalizeEmail(value: string | undefined | null) {
  return String(value ?? '').trim().toLowerCase();
}

export function getAdminEmails(): string[] {
  const configured = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  return [DEFAULT_ADMIN_EMAIL];
}

export function isAdminEmail(email: string | undefined | null): boolean {
  const candidate = normalizeEmail(email);
  if (!candidate) return false;
  return getAdminEmails().includes(candidate);
}

export function getAdminConfigMode(): 'configured' | 'default_fallback' {
  return (process.env.ADMIN_EMAILS ?? '').trim().length > 0
    ? 'configured'
    : 'default_fallback';
}
