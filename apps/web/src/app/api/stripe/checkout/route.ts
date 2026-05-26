import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import {
  STRIPE_BILLING_CONFIG_ERROR,
  getStripe,
  getPriceIdForPlan,
  isStripeConfigurationError,
  type SubscriptionPlan,
} from '@/utils/stripe';
import { checkVenueBillingAccess } from '@/utils/billing-access';
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

    const body = await req.json();
    const { venueId, orgId, plan } = body as { venueId: string; orgId: string; plan: SubscriptionPlan };

    if (!venueId || !orgId || !plan || plan === 'listed') {
      return NextResponse.json({ error: 'venueId, orgId, and a paid plan are required' }, { status: 400 });
    }

    const access = await checkVenueBillingAccess(supabase, user, orgId, venueId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const stripe = getStripe();
    const billingSupabase = access.isPlatformAdmin ? createServiceClient() : supabase;

    // Reuse existing Stripe customer if the venue already has one
    const { data: existingSub } = await billingSupabase
      .from('venue_subscriptions')
      .select('stripe_customer_id')
      .eq('venue_id', venueId)
      .maybeSingle() as any;

    let customerId: string | undefined = existingSub?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: access.venue.org_name ?? access.venue.name ?? undefined,
        metadata: { venue_id: venueId, org_id: orgId, user_id: user.id },
      });
      customerId = customer.id;
    }

    const priceId = await getPriceIdForPlan(plan as Exclude<SubscriptionPlan, 'listed'>);

    const origin = getSafeAppOrigin(req.headers.get('origin'));
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { venue_id: venueId, org_id: orgId, plan },
      },
      success_url: `${origin}/orgs/${orgId}/venues/${venueId}/subscription?subscription=success`,
      cancel_url:  `${origin}/orgs/${orgId}/venues/${venueId}/subscription?subscription=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout]', err);
    return NextResponse.json(
      {
        error: isStripeConfigurationError(err)
          ? STRIPE_BILLING_CONFIG_ERROR
          : 'Checkout failed. Please try again.',
      },
      { status: 500 }
    );
  }
}
