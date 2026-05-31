import Stripe from 'stripe';
import type { BundleTier } from './bundle';

// Singleton Stripe client — reused across invocations in the same function instance
let _stripe: Stripe | null = null;

export const STRIPE_BILLING_CONFIG_ERROR =
  'Billing is not configured yet. Please contact support.';

const STRIPE_CONFIG_ERROR_PATTERNS = [
  /^STRIPE_SECRET_KEY is not set$/,
  /^STRIPE_PRODUCT_(BASIC|FEATURED|PREMIUM|BUNDLE_2_4|BUNDLE_5_PLUS) is not set$/,
  /^No active recurring price found for product /,
];

/** Returns true when the error is a known Stripe misconfiguration (missing key/product). */
export function isStripeConfigurationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return STRIPE_CONFIG_ERROR_PATTERNS.some((pattern) => pattern.test(err.message));
}

/** Returns the singleton Stripe client, initializing it on first call. Throws if STRIPE_SECRET_KEY is absent. */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
  }
  return _stripe;
}

// Per-venue tiers. Org-level bundles (bundle_2_4 / bundle_5_plus) are NOT valid here —
// they live in org_subscriptions and are checked out through a separate org-level flow.
export type SubscriptionPlan = 'listed' | 'verified' | 'featured' | 'founding_pilot';

// Map plan name → Stripe product env var. The tiers were renamed (basic→verified) but the
// existing Stripe products are reused, so no env-var changes this pass. founding_pilot bills
// at the verified ($49) product but grants featured-level features (see subscription-features).
const PLAN_PRODUCT_ENV: Record<Exclude<SubscriptionPlan, 'listed'>, string> = {
  verified:       'STRIPE_PRODUCT_BASIC',
  featured:       'STRIPE_PRODUCT_FEATURED',
  founding_pilot: 'STRIPE_PRODUCT_BASIC',
};

/**
 * Returns the first active recurring price ID for the given plan's product.
 * Called at checkout time — the result can be cached by the caller if needed.
 */
export async function getPriceIdForPlan(plan: Exclude<SubscriptionPlan, 'listed'>): Promise<string> {
  const productId = process.env[PLAN_PRODUCT_ENV[plan]];
  if (!productId) throw new Error(`${PLAN_PRODUCT_ENV[plan]} is not set`);

  const stripe = getStripe();
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: 'recurring',
    limit: 1,
  });

  const price = prices.data[0];
  if (!price) throw new Error(`No active recurring price found for product ${productId} (${plan})`);
  return price.id;
}

// Org-level bundles. bundle_2_4 / bundle_5_plus map to their own Stripe products
// (different per-venue rates). Quantity = venue_count is set at checkout time.
const BUNDLE_PRODUCT_ENV: Record<BundleTier, string> = {
  bundle_2_4:    'STRIPE_PRODUCT_BUNDLE_2_4',
  bundle_5_plus: 'STRIPE_PRODUCT_BUNDLE_5_PLUS',
};

/** First active recurring (per-unit) price id for the given bundle tier's product. */
export async function getPriceIdForBundle(tier: BundleTier): Promise<string> {
  const productId = process.env[BUNDLE_PRODUCT_ENV[tier]];
  if (!productId) throw new Error(`${BUNDLE_PRODUCT_ENV[tier]} is not set`);

  const stripe = getStripe();
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: 'recurring',
    limit: 1,
  });

  const price = prices.data[0];
  if (!price) throw new Error(`No active recurring price found for product ${productId} (${tier})`);
  return price.id;
}
