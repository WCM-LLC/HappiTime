'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { getStripe } from '@/utils/stripe';
import { getSafeAppOrigin } from '@/utils/security';
import { bundleTierForCount, rateForBundleTier } from '@/utils/bundle';
import { createOrgBundleCheckoutSession } from '@/utils/bundle-checkout';

async function countOrgVenues(supabase: ReturnType<typeof getAdminClient>, orgId: string): Promise<number> {
  const { count } = await supabase.from('venues').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
  return count ?? 0;
}

/** Comp a no-charge pilot bundle: writes org_subscriptions directly, no Stripe. */
export async function adminGrantPilotBundle(formData: FormData) {
  await assertAdmin();
  const orgId = formData.get('org_id') as string | null;
  if (!orgId) throw new Error('org_id is required');
  const supabase = getAdminClient();

  const venueCount = await countOrgVenues(supabase, orgId);
  const tier = bundleTierForCount(venueCount);
  if (!tier) throw new Error('A bundle needs at least 2 venues');

  const { error } = await (supabase as any).from('org_subscriptions').upsert(
    {
      org_id: orgId,
      bundle_tier: tier,
      monthly_rate_per_venue_cents: rateForBundleTier(tier),
      venue_count: venueCount,
      status: 'pilot',
    },
    { onConflict: 'org_id' },
  );
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}

/** Create a checkout session for the org; returns the URL for staff to share. */
export async function adminCreateBundleCheckoutLink(formData: FormData): Promise<string> {
  await assertAdmin();
  const orgId = formData.get('org_id') as string | null;
  if (!orgId) throw new Error('org_id is required');
  const supabase = getAdminClient();

  const venueCount = await countOrgVenues(supabase, orgId);
  const tier = bundleTierForCount(venueCount);
  if (!tier) throw new Error('A bundle needs at least 2 venues');

  const { url } = await createOrgBundleCheckoutSession({
    orgId,
    tier,
    quantity: venueCount,
    customerEmail: null,
    billingSupabase: supabase,
    origin: getSafeAppOrigin(null),
  });
  return url ?? '';
}

/** Cancel a bundle on behalf of an org. Paid -> Stripe cancel (webhook updates DB);
 *  comped pilot (no Stripe sub) -> set status canceled directly. */
export async function adminCancelOrgBundle(formData: FormData) {
  await assertAdmin();
  const orgId = formData.get('org_id') as string | null;
  if (!orgId) throw new Error('org_id is required');
  const supabase = getAdminClient();

  const { data: row } = await (supabase as any)
    .from('org_subscriptions')
    .select('stripe_subscription_id')
    .eq('org_id', orgId)
    .maybeSingle();

  if (row?.stripe_subscription_id) {
    await getStripe().subscriptions.cancel(row.stripe_subscription_id);
    // webhook (customer.subscription.deleted) flips org_subscriptions to canceled
  } else {
    const { error } = await (supabase as any)
      .from('org_subscriptions')
      .update({ status: 'canceled' })
      .eq('org_id', orgId);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/admin/plans');
}
