import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import {
  STRIPE_BILLING_CONFIG_ERROR,
  isStripeConfigurationError,
} from '@/utils/stripe';
import { bundleTierForCount } from '@/utils/bundle';
import { checkOrgBillingAccess } from '@/utils/billing-access';
import { getSafeAppOrigin, isTrustedBrowserRequest } from '@/utils/security';
import { createOrgBundleCheckoutSession } from '@/utils/bundle-checkout';

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

    const billingSupabase = access.isPlatformAdmin ? createServiceClient() : supabase;
    const origin = getSafeAppOrigin(req.headers.get('origin'));
    const { url } = await createOrgBundleCheckoutSession({
      orgId,
      tier,
      quantity: access.venueCount,
      customerEmail: user.email ?? null,
      billingSupabase,
      origin,
      userId: user.id,
    });
    return NextResponse.json({ url });
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
