import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/utils/stripe';
import { rateForBundleTier, type BundleTier } from '@/utils/bundle';
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

// ── Org bundle (Phase 4-2) ────────────────────────────────────────────────────
// Org-level bundle subs carry metadata.bundle_tier (and no venue_id). They write
// org_subscriptions (org-wide elevation via 4.1) and, on activation, cancel the
// org's per-venue subs so the org isn't double-billed.

function isOrgBundleSub(sub: Stripe.Subscription): boolean {
  return Boolean(sub.metadata?.bundle_tier) && !sub.metadata?.venue_id;
}

function isBundleTier(value: unknown): value is BundleTier {
  return value === 'bundle_2_4' || value === 'bundle_5_plus';
}

function getSubscriptionQuantity(sub: Stripe.Subscription): number {
  return (sub as any).items?.data?.[0]?.quantity ?? 0;
}

async function handleOrgBundleUpsert(
  supabase: ReturnType<typeof createServiceClient>,
  sub: Stripe.Subscription,
  customerId: string,
) {
  const orgId = sub.metadata?.org_id;
  const tier = sub.metadata?.bundle_tier;

  if (!orgId || !isBundleTier(tier)) {
    console.warn('[webhook] bundle sub missing org_id or valid bundle_tier', sub.id);
    return;
  }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle();
  if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
  if (!org) {
    console.warn('[webhook] bundle org not found', sub.id);
    return;
  }

  const status = mapSubscriptionStatus(sub.status);
  const isActive = grantsPaidAccess(status);
  const venueCount = getSubscriptionQuantity(sub);
  const currentPeriodEnd = unixSecondsToIso((sub as any).current_period_end);

  const patch: Record<string, unknown> = {
    org_id:                 orgId,
    bundle_tier:            tier,
    monthly_rate_per_venue_cents: rateForBundleTier(tier),
    venue_count:            venueCount,
    status,
    stripe_subscription_id: sub.id,
    stripe_customer_id:     customerId,
  };
  if (currentPeriodEnd) patch.current_period_end = currentPeriodEnd;

  const { error: upsertErr } = await (supabase as any)
    .from('org_subscriptions')
    .upsert(patch, { onConflict: 'org_id' });
  if (upsertErr) throw new Error(`org_subscriptions upsert failed: ${upsertErr.message}`);

  // On activation, cancel the org's per-venue Stripe subs. Cancelling fires
  // customer.subscription.deleted, whose existing handler zeros venue_subscriptions
  // + promotion_tier. The bundle then supplies the effective tier org-wide (4.1).
  if (isActive) {
    // Two-step (no PostgREST embedded-relationship filter): fetch the org's venue
    // ids, then the per-venue subs by id. A wrong embed would silently return zero
    // rows here — i.e. fail to cancel and double-bill — so we avoid it entirely.
    const { data: orgVenues } = await supabase
      .from('venues')
      .select('id')
      .eq('org_id', orgId);
    const venueIds = ((orgVenues ?? []) as Array<{ id: string }>).map((v) => v.id);

    if (venueIds.length > 0) {
      const { data: venueSubs } = await (supabase as any)
        .from('venue_subscriptions')
        .select('stripe_subscription_id')
        .in('venue_id', venueIds)
        .not('stripe_subscription_id', 'is', null)
        .neq('status', 'canceled');

      for (const row of (venueSubs ?? []) as Array<{ stripe_subscription_id: string }>) {
        try {
          await getStripe().subscriptions.cancel(row.stripe_subscription_id);
        } catch (e) {
          console.warn('[webhook] per-venue cancel failed', row.stripe_subscription_id, e);
        }
      }
    }
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
        if (isOrgBundleSub(sub)) {
          await handleOrgBundleUpsert(supabase, sub, customerId);
        } else {
          await handleSubscriptionUpsert(supabase, sub, customerId);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = getStripeId(sub.customer);
        if (!customerId) throw new Error('Missing Stripe customer id');
        if (isOrgBundleSub(sub)) {
          await handleOrgBundleUpsert(supabase, sub, customerId);
        } else {
          await handleSubscriptionUpsert(supabase, sub, customerId);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(invoice);
        if (!subId) break;

        const sub = await getStripe().subscriptions.retrieve(subId);
        const customerId = getStripeId(sub.customer);
        if (!customerId) throw new Error('Missing Stripe customer id');
        if (isOrgBundleSub(sub)) {
          await handleOrgBundleUpsert(supabase, sub, customerId);
        } else {
          await handleSubscriptionUpsert(supabase, sub, customerId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(invoice);
        if (!subId) break;

        // A bundle sub failing payment: drop it past_due so the read path's
        // active-status gate stops elevating the org's venues. No-op for venue subs.
        await (supabase as any)
          .from('org_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', subId);

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
