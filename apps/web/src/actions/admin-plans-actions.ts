'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';

const VENUE_PLANS = new Set(['listed', 'verified', 'featured', 'founding_pilot']);
const VENUE_STATUSES = new Set(['active', 'past_due', 'canceled', 'trialing', 'paused']);
const PAID_VENUE_PLANS = new Set(['verified', 'featured', 'founding_pilot']);

function normalizeVenuePlan(value: string) {
  if (!VENUE_PLANS.has(value)) throw new Error('Invalid venue plan');
  return value;
}

function normalizeVenueStatus(value: string) {
  const status = value === 'trial' ? 'trialing' : value === 'inactive' ? 'canceled' : value;
  if (!VENUE_STATUSES.has(status)) throw new Error('Invalid venue subscription status');
  return status;
}

function promotionTierFor(plan: string, status: string) {
  return (status === 'active' || status === 'trialing') && PAID_VENUE_PLANS.has(plan)
    ? plan
    : null;
}

export async function adminUpsertVenueSubscription(formData: FormData) {
  await assertAdmin();
  const venueId = formData.get('venue_id') as string | null;
  const rawPlan = formData.get('plan')     as string | null;
  const rawStatus = formData.get('status')   as string | null;
  if (!venueId || !rawPlan || !rawStatus) throw new Error('venue_id, plan, and status are required');
  const plan = normalizeVenuePlan(rawPlan);
  const status = normalizeVenueStatus(rawStatus);
  const supabase = getAdminClient();

  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .select('org_id')
    .eq('id', venueId)
    .maybeSingle();

  if (venueError) throw new Error(venueError.message);
  if (!venue?.org_id) throw new Error('Venue not found');

  const { error } = await (supabase as any)
    .from('venue_subscriptions')
    .upsert(
      {
        venue_id: venueId,
        org_id: venue.org_id,
        plan,
        status,
        manual_override: true,
      },
      { onConflict: 'venue_id' },
    );
  if (error) throw new Error(error.message);

  const { error: tierError } = await supabase
    .from('venues')
    .update({ promotion_tier: promotionTierFor(plan, status) } as any)
    .eq('id', venueId);

  if (tierError) throw new Error(tierError.message);
  revalidatePath('/admin/plans');
}

export async function adminUpsertUserPlan(formData: FormData) {
  await assertAdmin();
  const userId = formData.get('user_id') as string | null;
  const plan   = formData.get('plan')    as string | null;
  const status = formData.get('status')  as string | null;
  if (!userId || !plan || !status) throw new Error('user_id, plan, and status are required');
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('user_plans')
    .upsert({ user_id: userId, plan, status }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}

export async function adminDeleteVenueSubscription(formData: FormData) {
  await assertAdmin();
  const venueId = formData.get('venue_id') as string | null;
  if (!venueId) throw new Error('venue_id is required');
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('venue_subscriptions')
    .delete()
    .eq('venue_id', venueId);
  if (error) throw new Error(error.message);

  const { error: venueError } = await supabase
    .from('venues')
    .update({ promotion_tier: null } as any)
    .eq('id', venueId);

  if (venueError) throw new Error(venueError.message);
  revalidatePath('/admin/plans');
}

export async function adminDeleteUserPlan(formData: FormData) {
  await assertAdmin();
  const userId = formData.get('user_id') as string | null;
  if (!userId) throw new Error('user_id is required');
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('user_plans')
    .delete()
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}
