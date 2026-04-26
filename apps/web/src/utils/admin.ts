import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

/**
 * Asserts the current session belongs to an email listed in ADMIN_EMAILS env var.
 * Throws 'Unauthorized' if the check fails or no admin emails are configured.
 * Depends on: Supabase auth session, ADMIN_EMAILS env var.
 */
export async function assertAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email?.toLowerCase() ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length === 0 || !adminEmails.includes(email)) {
    throw new Error('Unauthorized');
  }
}

/**
 * Returns a service-role Supabase client.
 * Throws if SUPABASE_SERVICE_ROLE_KEY is missing or invalid.
 * Depends on: SUPABASE_SERVICE_ROLE_KEY env var.
 */
export function getAdminClient() {
  if (getServiceRoleKeyError()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createServiceClient();
}
