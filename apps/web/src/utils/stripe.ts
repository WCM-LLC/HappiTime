import Stripe from 'stripe';

// Singleton Stripe client — reused across invocations in the same function instance
let _stripe: Stripe | null = null;

export const STRIPE_BILLING_CONFIG_ERROR =
  'Billing is not configured yet. Please contact support.';

const STRIPE_CONFIG_ERROR_PATTERNS = [
  /^STRIPE_SECRET_KEY is not set$/,
  /^STRIPE_PRODUCT_(BASIC|FEATURED|PREMIUM) is not set$/,
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

export type SubscriptionPlan = 'listed' | 'basic' | 'featured' | 'premium';

// Map plan name → Stripe product env var
const PLAN_PRODUCT_ENV: Record<Exclude<SubscriptionPlan, 'listed'>, string> = {
  basic:    'STRIPE_PRODUCT_BASIC',
  featured: 'STRIPE_PRODUCT_FEATURED',
  premium:  'STRIPE_PRODUCT_PREMIUM',
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
