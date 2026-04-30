import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getStripe, getPriceIdForPlan, type SubscriptionPlan } from '@/utils/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
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

    // Verify the user has owner/manager access via the org
    const { data: member } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .in('role', ['owner', 'manager'])
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stripe = getStripe();

    // Reuse existing Stripe customer if the venue already has one
    const { data: existingSub } = await supabase
      .from('venue_subscriptions')
      .select('stripe_customer_id')
      .eq('venue_id', venueId)
      .maybeSingle() as any;

    let customerId: string | undefined = existingSub?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const { data: venue } = await supabase
        .from('venues')
        .select('name, org_name')
        .eq('id', venueId)
        .single();

      const customer = await stripe.customers.create({
        email: user.email,
        name: venue?.org_name ?? venue?.name ?? undefined,
        metadata: { venue_id: venueId, user_id: user.id },
      });
      customerId = customer.id;
    }

    const priceId = await getPriceIdForPlan(plan as Exclude<SubscriptionPlan, 'listed'>);

    const origin = req.headers.get('origin') ?? 'https://www.happitime.biz';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { venue_id: venueId, org_id: orgId, plan },
      },
      success_url: `${origin}/orgs/${body.orgId}/venues/${venueId}?subscription=success`,
      cancel_url:  `${origin}/orgs/${body.orgId}/venues/${venueId}?subscription=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
