import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

export const SUPER_ADMIN_EMAIL = 'admin@happitime.biz';

function normalizeEmail(value: string | undefined | null) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Returns the current list of admin emails.
 * Prefers the admin_users DB table (service role). Falls back to the
 * ADMIN_EMAILS env var, then to SUPER_ADMIN_EMAIL if neither is set.
 */
export async function getAdminEmails(): Promise<string[]> {
  if (!getServiceRoleKeyError()) {
    try {
      const db = createServiceClient();
      const { data } = await db.from('admin_users').select('email');
      if (data && data.length > 0) {
        return data.map((r: { email: string }) => normalizeEmail(r.email)).filter(Boolean);
      }
    } catch {
      // Service role client unavailable; fall through to env / default.
    }
  }

  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : [SUPER_ADMIN_EMAIL];
}

export async function isAdminEmail(email: string | undefined | null): Promise<boolean> {
  const candidate = normalizeEmail(email);
  if (!candidate) return false;
  return (await getAdminEmails()).includes(candidate);
}

export function getAdminConfigMode(): 'configured' | 'default_fallback' {
  return (process.env.ADMIN_EMAILS ?? '').trim().length > 0
    ? 'configured'
    : 'default_fallback';
}
