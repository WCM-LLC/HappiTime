import type { User } from '@supabase/supabase-js';
import { isAdminEmail } from '@/utils/admin-emails';
import { createClient, createServiceClient } from '@/utils/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type BillingVenue = {
  id: string;
  org_id: string;
  name: string | null;
  org_name: string | null;
};

type BillingAccessAllowed = {
  allowed: true;
  isPlatformAdmin: boolean;
  role: string | null;
  venue: BillingVenue;
};

type BillingAccessDenied = {
  allowed: false;
  status: 400 | 403;
  error: string;
};

export type BillingAccessResult = BillingAccessAllowed | BillingAccessDenied;

const BILLING_MANAGER_ROLES = new Set(['owner', 'manager']);

function getOptionalServiceClient(): SupabaseServerClient | null {
  try {
    return createServiceClient() as SupabaseServerClient;
  } catch {
    return null;
  }
}

export async function checkVenueBillingAccess(
  supabase: SupabaseServerClient,
  user: User,
  orgId: string,
  venueId: string,
): Promise<BillingAccessResult> {
  if (!orgId || !venueId) {
    return { allowed: false, status: 400, error: 'venueId and orgId are required' };
  }

  const isPlatformAdmin = await isAdminEmail(user.email);
  const serviceSupabase = isPlatformAdmin ? getOptionalServiceClient() : null;
  const lookupSupabase = serviceSupabase ?? supabase;

  const { data: venue } = await lookupSupabase
    .from('venues')
    .select('id, org_id, name, org_name')
    .eq('id', venueId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!venue) {
    return { allowed: false, status: 403, error: 'Forbidden' };
  }

  if (isPlatformAdmin && serviceSupabase) {
    return {
      allowed: true,
      isPlatformAdmin: true,
      role: null,
      venue: venue as BillingVenue,
    };
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String(membership?.role ?? '');
  if (!BILLING_MANAGER_ROLES.has(role)) {
    return { allowed: false, status: 403, error: 'Forbidden' };
  }

  if (role !== 'owner') {
    const { data: assignment } = await supabase
      .from('venue_members')
      .select('venue_id')
      .eq('org_id', orgId)
      .eq('venue_id', venueId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!assignment) {
      return { allowed: false, status: 403, error: 'Forbidden' };
    }
  }

  return {
    allowed: true,
    isPlatformAdmin: Boolean(isPlatformAdmin && serviceSupabase),
    role,
    venue: venue as BillingVenue,
  };
}
