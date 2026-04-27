// Service-role surface — admin helpers.
// getAdminClient() callers: actions/admin-actions.ts, actions/admin-plans-actions.ts
// isAdmin() / assertAdmin() callers: app/admin/layout.tsx, all admin server actions
// Direct createServiceClient() callers outside this file:
//   app/admin/page.tsx, app/admin/plans/page.tsx, app/admin/suggestions/page.tsx
//   app/orgs/[orgId]/page.tsx, app/orgs/[orgId]/venues/[venueId]/page.tsx (admin bypass)
//   app/invite/page.tsx, actions/access-actions.ts (invite / org membership)
//   app/api/events/ingest/route.ts (raw env var, not via createServiceClient)
//   supabase/functions: notify-venue-updates, notify-upcoming-happy-hours, notify-friend-activity
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

let _adminEmailsLogged = false;

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Returns true if the current session belongs to an email in ADMIN_EMAILS.
 * Use in layouts/pages that redirect rather than throw.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email?.toLowerCase() ?? '';
  const adminEmails = getAdminEmails();
  if (!_adminEmailsLogged) {
    _adminEmailsLogged = true;
    console.log(`[admin] ADMIN_EMAILS: ${adminEmails.length} entr${adminEmails.length === 1 ? 'y' : 'ies'} configured`);
  }
  return adminEmails.length > 0 && adminEmails.includes(email);
}

/**
 * Asserts the current session belongs to an email listed in ADMIN_EMAILS env var.
 * Throws 'Unauthorized' if the check fails or no admin emails are configured.
 * Depends on: Supabase auth session, ADMIN_EMAILS env var.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isAdmin())) {
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
