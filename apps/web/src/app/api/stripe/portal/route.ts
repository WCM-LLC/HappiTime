import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  STRIPE_BILLING_CONFIG_ERROR,
  getStripe,
  isStripeConfigurationError,
} from '@/utils/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { venueId, orgId } = await req.json() as { venueId: string; orgId: string };

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

    const { data: sub } = await supabase
      .from('venue_subscriptions')
      .select('stripe_customer_id')
      .eq('venue_id', venueId)
      .maybeSingle() as any;

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const origin = req.headers.get('origin') ?? 'https://www.happitime.biz';
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/orgs/${orgId}/venues/${venueId}/subscription`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/portal]', err);
    return NextResponse.json(
      {
        error: isStripeConfigurationError(err)
          ? STRIPE_BILLING_CONFIG_ERROR
          : 'Could not open billing. Please try again.',
      },
      { status: 500 }
    );
  }
}
