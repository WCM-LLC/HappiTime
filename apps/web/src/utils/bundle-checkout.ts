import { getStripe, getPriceIdForBundle } from '@/utils/stripe';
import type { BundleTier } from '@/utils/bundle';

type SessionOpts = {
  orgId: string;
  tier: BundleTier;
  quantity: number;
  customerEmail: string | null;
  /** Supabase client used to read/store the org's Stripe customer id. */
  billingSupabase: any;
  origin: string;
  userId?: string;
};

/**
 * Build a subscription Checkout Session for an org bundle. Reuses the org's
 * existing Stripe customer (org_subscriptions.stripe_customer_id) or creates one.
 * Shared by /api/stripe/org-checkout and the admin "generate link" action.
 */
export async function createOrgBundleCheckoutSession(opts: SessionOpts): Promise<{ url: string | null; sessionId: string }> {
  const { orgId, tier, quantity, customerEmail, billingSupabase, origin, userId } = opts;
  const stripe = getStripe();

  const { data: existing } = await billingSupabase
    .from('org_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  let customerId: string | undefined = existing?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: customerEmail ?? undefined,
      metadata: { org_id: orgId, ...(userId ? { user_id: userId } : {}) },
    });
    customerId = customer.id;
  }

  const priceId = await getPriceIdForBundle(tier);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    subscription_data: { metadata: { org_id: orgId, bundle_tier: tier } },
    success_url: `${origin}/orgs/${orgId}?bundle=success`,
    cancel_url: `${origin}/orgs/${orgId}?bundle=cancelled`,
  });

  return { url: session.url, sessionId: session.id };
}
