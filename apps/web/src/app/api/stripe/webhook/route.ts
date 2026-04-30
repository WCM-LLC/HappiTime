import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/utils/stripe';
import { createServiceClient } from '@/utils/supabase/server';

// Raw body required for Stripe signature verification
export const runtime = 'nodejs';

const TIER_FOR_PLAN: Record<string, string> = {
  basic:    'basic',
  featured: 'featured',
  premium:  'premium',
};

function verifyWebhookEvent(payload: Buffer, sig: string): Stripe.Event | null {
  const stripe = getStripe();
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_THIN,
  ].filter(Boolean) as string[];

  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(payload, sig, secret);
    } catch {
      // try next secret
    }
  }
  return null;
}

async function handleSubscriptionUpsert(
  supabase: ReturnType<typeof createServiceClient>,
  sub: Stripe.Subscription,
  customerId: string
) {
  const venueId = sub.metadata?.venue_id;
  const orgId   = sub.metadata?.org_id;
  const plan    = sub.metadata?.plan as string | undefined;

  if (!venueId || !orgId || !plan) {
    console.warn('[webhook] subscription missing venue_id, org_id, or plan metadata', sub.id);
    return;
  }

  const isActive = sub.status === 'active' || sub.status === 'trialing';
  // null = free/listed tier; matches existing venue rows where promotion_tier is null
  const tier   = isActive ? (TIER_FOR_PLAN[plan] ?? null) : null;
  const status = isActive ? 'active' : sub.status === 'past_due' ? 'past_due' : 'inactive';

  // Update venue_subscriptions
  const { error: subError } = await (supabase as any)
    .from('venue_subscriptions')
    .upsert(
      {
        venue_id:               venueId,
        org_id:                 orgId,
        plan:                   isActive ? plan : 'listed',
        status,
        stripe_subscription_id: sub.id,
        stripe_customer_id:     customerId,
      },
      { onConflict: 'venue_id' }
    );

  if (subError) {
    console.error('[webhook] venue_subscriptions upsert failed', subError.message);
  }

  // Keep venues.promotion_tier in sync so mobile push logic stays correct
  const { error: venueError } = await supabase
    .from('venues')
    .update({ promotion_tier: tier } as any)
    .eq('id', venueId);

  if (venueError) {
    console.error('[webhook] venues promotion_tier update failed', venueError.message);
  }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const payload = Buffer.from(await req.arrayBuffer());
  const event = verifyWebhookEvent(payload, sig);

  if (!event) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription' || !session.subscription) break;

        const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
        await handleSubscriptionUpsert(supabase, sub, session.customer as string);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpsert(supabase, sub, sub.customer as string);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | undefined;
        if (!subId) break;

        await (supabase as any)
          .from('venue_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', subId);
        break;
      }

      default:
        // Unhandled event types — not an error
        break;
    }
  } catch (err) {
    console.error('[webhook] handler error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Handler error' },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
