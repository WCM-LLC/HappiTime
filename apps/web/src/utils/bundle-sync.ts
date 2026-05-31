import { createServiceClient } from '@/utils/supabase/server';
import { getStripe, getPriceIdForBundle } from '@/utils/stripe';
import { bundleTierForCount } from '@/utils/bundle';

/**
 * Keep an org's active bundle subscription in sync with its venue count. Updates
 * the Stripe item quantity; if the count crosses 2..4 <-> 5+, swaps the item to
 * the other bundle product (the per-venue rate changes). org_subscriptions is
 * reconciled by the resulting customer.subscription.updated webhook (single
 * source of truth), so this does not write the table. No-op when the org has no
 * active bundle. Fail-open: logs and returns on any error.
 */
export async function syncBundleQuantity(orgId: string): Promise<void> {
  if (!orgId) return;
  const supabase = createServiceClient();

  const { data: bundle } = await (supabase as any)
    .from('org_subscriptions')
    .select('bundle_tier, stripe_subscription_id, status')
    .eq('org_id', orgId)
    .maybeSingle();

  const activeStatuses = new Set(['active', 'trialing', 'pilot']);
  if (!bundle?.stripe_subscription_id || !activeStatuses.has(bundle.status)) return;

  const { count } = await (supabase as any)
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  const newCount = count ?? 0;
  const newTier = bundleTierForCount(newCount);
  if (!newTier) return; // <2 venues: leave the subscription untouched (cancel handled elsewhere)

  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(bundle.stripe_subscription_id);
    const item = (sub as any).items?.data?.[0];
    if (!item) return;

    const update: any = { items: [{ id: item.id, quantity: newCount }] };
    if (newTier !== bundle.bundle_tier) {
      update.items[0].price = await getPriceIdForBundle(newTier);
      // Also move metadata.bundle_tier so the reconciling subscription.updated
      // webhook (handleOrgBundleUpsert reads sub.metadata.bundle_tier) writes the
      // NEW tier + rate to org_subscriptions — otherwise they go stale on a swap.
      update.metadata = { ...sub.metadata, bundle_tier: newTier };
    }
    await stripe.subscriptions.update(bundle.stripe_subscription_id, update);
  } catch (e) {
    console.warn('[bundle-sync] sync failed for org', orgId, e);
  }
}
