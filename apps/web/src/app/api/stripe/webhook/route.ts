import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/utils/stripe';
import { createServiceClient } from '@/utils/supabase/server';

// Raw body required for Stripe signature verification
export const runtime = 'nodejs';

// Paid per-venue plan → valid venues.promotion_tier.
// founding_pilot bills at the verified product but grants featured-level display tier.
const TIER_FOR_PLAN: Record<string, string> = {
  verified:       'verified',
  featured:       'featured',
  founding_pilot: 'featured',
};

const PAID_PLANS = new Set(Object.keys(TIER_FOR_PLAN));

// plan → Stripe product env var. Tiers were renamed (basic→verified) but the existing
// Stripe products are reused, so STRIPE_PRODUCT_VERIFIED does not exist — map explicitly.
const PLAN_PRODUCT_ENV: Record<string, string> = {
  verified:       'STRIPE_PRODUCT_BASIC',
  featured:       'STRIPE_PRODUCT_FEATURED',
  founding_pilot: 'STRIPE_PRODUCT_BASIC',
};

type DbSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'paused';

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

function getStripeId(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === 'string') return value;
  return typeof value?.id === 'string' ? value.id : null;
}

function isPaidPlan(value: unknown): value is 'verified' | 'featured' | 'founding_pilot' {
  return typeof value === 'string' && PAID_PLANS.has(value);
}

function mapSubscriptionStatus(status: string): DbSubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'paused':
      return status;
    case 'incomplete':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
    default:
      return 'canceled';
  }
}

function grantsPaidAccess(status: DbSubscriptionStatus) {
  return status === 'active' || status === 'trialing';
}

function unixSecondsToIso(value: unknown): string | null {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

function getSubscriptionPriceId(sub: Stripe.Subscription): string | null {
  return (sub as any).items?.data?.[0]?.price?.id ?? null;
}

function subscriptionProductMatchesPlan(sub: Stripe.Subscription, plan: 'verified' | 'featured' | 'founding_pilot') {
  const expectedProduct = process.env[PLAN_PRODUCT_ENV[plan]];
  if (!expectedProduct) return true;

  const items = ((sub as any).items?.data ?? []) as Array<{ price?: { product?: string | { id?: string } } }>;
  const productIds = items
    .map((item) => getStripeId(item.price?.product ?? null))
    .filter((item): item is string => Boolean(item));

  return productIds.length === 0 || productIds.includes(expectedProduct);
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const rawInvoice = invoice as any;
  return (
    getStripeId(rawInvoice.subscription) ??
    getStripeId(rawInvoice.parent?.subscription_details?.subscription) ??
    null
  );
}

async function handleSubscriptionUpsert(
  supabase: ReturnType<typeof createServiceClient>,
  sub: Stripe.Subscription,
  customerId: string
) {
  const venueId = sub.metadata?.venue_id;
  const orgId   = sub.metadata?.org_id;
  const plan    = sub.metadata?.plan;

  if (!venueId || !orgId || !isPaidPlan(plan)) {
    console.warn('[webhook] subscription missing venue_id, org_id, or plan metadata', sub.id);
    return;
  }

  if (!subscriptionProductMatchesPlan(sub, plan)) {
    console.warn('[webhook] subscription product does not match metadata plan', sub.id);
    return;
  }

  const { data: venue, error: venueLookupError } = await supabase
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (venueLookupError) {
    throw new Error(`Venue lookup failed: ${venueLookupError.message}`);
  }

  if (!venue) {
    console.warn('[webhook] subscription venue/org metadata did not match a venue', sub.id);
    return;
  }

  const status = mapSubscriptionStatus(sub.status);
  const isActive = grantsPaidAccess(status);
  // null = free/listed tier; matches existing venue rows where promotion_tier is null
  const tier   = isActive ? (TIER_FOR_PLAN[plan] ?? null) : null;
  const priceId = getSubscriptionPriceId(sub);
  const currentPeriodStart = unixSecondsToIso((sub as any).current_period_start);
  const currentPeriodEnd = unixSecondsToIso((sub as any).current_period_end);

  const subscriptionPatch: Record<string, unknown> = {
    venue_id:               venueId,
    org_id:                 orgId,
    plan:                   status === 'canceled' ? 'listed' : plan,
    status,
    stripe_subscription_id: sub.id,
    stripe_customer_id:     customerId,
    manual_override:        false,
  };

  if (priceId) subscriptionPatch.stripe_price_id = priceId;
  if (currentPeriodStart) subscriptionPatch.stripe_current_period_start = currentPeriodStart;
  if (currentPeriodEnd) subscriptionPatch.stripe_current_period_end = currentPeriodEnd;

  // Update venue_subscriptions
  const { error: subError } = await (supabase as any)
    .from('venue_subscriptions')
    .upsert(
      subscriptionPatch,
      { onConflict: 'venue_id' }
    );

  if (subError) {
    throw new Error(`venue_subscriptions upsert failed: ${subError.message}`);
  }

  // Keep venues.promotion_tier in sync so mobile push logic stays correct
  const { error: venueError } = await supabase
    .from('venues')
    .update({ promotion_tier: tier } as any)
    .eq('id', venueId);

  if (venueError) {
    throw new Error(`venues promotion_tier update failed: ${venueError.message}`);
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
        const customerId = getStripeId(session.customer) ?? getStripeId(sub.customer);
        if (!customerId) throw new Error('Missing Stripe customer id');
        await handleSubscriptionUpsert(supabase, sub, customerId);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = getStripeId(sub.customer);
        if (!customerId) throw new Error('Missing Stripe customer id');
        await handleSubscriptionUpsert(supabase, sub, customerId);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(invoice);
        if (!subId) break;

        const sub = await getStripe().subscriptions.retrieve(subId);
        const customerId = getStripeId(sub.customer);
        if (!customerId) throw new Error('Missing Stripe customer id');
        await handleSubscriptionUpsert(supabase, sub, customerId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(invoice);
        if (!subId) break;

        const { data: affectedRows, error: subError } = await (supabase as any)
          .from('venue_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', subId)
          .select('venue_id');

        if (subError) {
          throw new Error(`invoice payment failure update failed: ${subError.message}`);
        }

        const affectedVenueIds = Array.from(
          new Set(((affectedRows ?? []) as Array<{ venue_id: string }>).map((row) => row.venue_id).filter(Boolean)),
        );

        if (affectedVenueIds.length > 0) {
          const { error: venueError } = await supabase
            .from('venues')
            .update({ promotion_tier: null } as any)
            .in('id', affectedVenueIds);

          if (venueError) {
            throw new Error(`invoice payment failure venue update failed: ${venueError.message}`);
          }
        }
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
