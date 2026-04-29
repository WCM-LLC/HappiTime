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
import { isAdminEmail } from '@/utils/admin-emails';

export { SUPER_ADMIN_EMAIL } from '@/utils/admin-emails';

/**
 * Always true: admin emails are always configured (DB is seeded with super admin).
 * Kept for backwards compatibility with existing callers.
 */
export function hasAdminEmailsConfigured(): boolean {
  return true;
}

/**
 * Returns true if the current session belongs to an admin email.
 * Use in layouts/pages that redirect rather than throw.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  return isAdminEmail(auth.user?.email);
}

/**
 * Asserts the current session belongs to an admin email.
 * Throws 'Unauthorized' if not.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error('Unauthorized');
  }
}

/**
 * Returns a service-role Supabase client.
 * Throws if SUPABASE_SERVICE_ROLE_KEY is missing or invalid.
 */
export function getAdminClient() {
  if (getServiceRoleKeyError()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createServiceClient();
}
