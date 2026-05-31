import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import {
  STRIPE_BILLING_CONFIG_ERROR,
  getStripe,
  getPriceIdForBundle,
  isStripeConfigurationError,
} from '@/utils/stripe';
import { bundleTierForCount } from '@/utils/bundle';
import { checkOrgBillingAccess } from '@/utils/billing-access';
import { getSafeAppOrigin, isTrustedBrowserRequest } from '@/utils/security';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (!isTrustedBrowserRequest(req.headers)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = (await req.json()) as { orgId: string };
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

    const access = await checkOrgBillingAccess(supabase, user, orgId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const tier = bundleTierForCount(access.venueCount);
    if (!tier) {
      return NextResponse.json(
        { error: 'A bundle needs at least 2 venues. Add venues or use per-venue plans.' },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const billingSupabase = access.isPlatformAdmin ? createServiceClient() : supabase;

    // Reuse the org's existing Stripe customer if a bundle row already has one
    const { data: existing } = await billingSupabase
      .from('org_subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .maybeSingle() as any;

    let customerId: string | undefined = existing?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { org_id: orgId, user_id: user.id },
      });
      customerId = customer.id;
    }

    const priceId = await getPriceIdForBundle(tier);
    const origin = getSafeAppOrigin(req.headers.get('origin'));
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: access.venueCount }],
      subscription_data: { metadata: { org_id: orgId, bundle_tier: tier } },
      success_url: `${origin}/orgs/${orgId}?bundle=success`,
      cancel_url: `${origin}/orgs/${orgId}?bundle=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/org-checkout]', err);
    return NextResponse.json(
      {
        error: isStripeConfigurationError(err)
          ? STRIPE_BILLING_CONFIG_ERROR
          : 'Checkout failed. Please try again.',
      },
      { status: 500 },
    );
  }
}
