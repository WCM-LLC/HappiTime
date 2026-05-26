import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import {
  STRIPE_BILLING_CONFIG_ERROR,
  getStripe,
  isStripeConfigurationError,
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

    const { venueId, orgId } = await req.json() as { venueId: string; orgId: string };

    const access = await checkVenueBillingAccess(supabase, user, orgId, venueId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const billingSupabase = access.isPlatformAdmin ? createServiceClient() : supabase;

    const { data: sub } = await billingSupabase
      .from('venue_subscriptions')
      .select('stripe_customer_id')
      .eq('venue_id', venueId)
      .maybeSingle() as any;

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const origin = getSafeAppOrigin(req.headers.get('origin'));
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
