# Checkout Promo Codes (Stripe-native) — Design

**Date:** 2026-07-21
**Status:** Approved

## Goal

Venue owners can apply coupon codes when paying for a HappiTime subscription. Codes are created and managed in the Stripe Dashboard; venues enter them on Stripe's hosted checkout page.

## Approach

Stripe-native promotion codes. Enable Stripe's built-in "Add promotion code" field by setting `allow_promotion_codes: true` on every Checkout Session the app creates. No app-side coupon storage, validation, or UI beyond a hint line.

Rejected alternatives:
- **In-app code entry pre-applying `discounts`** — more UI and validation work; not needed since the hosted page handles it. Note `allow_promotion_codes` and `discounts` are mutually exclusive on a session, so a future pre-applied-campaign flow would be a separate path.
- **Fully app-managed coupons table** — most control/attribution, unjustified for current needs (YAGNI).

## Scope

All three checkout paths get the promo code field:

1. **Per-venue plan upgrades** — `apps/web/src/app/api/stripe/checkout/route.ts` (`stripe.checkout.sessions.create`, ~line 63).
2. **Org bundle self-checkout and admin-generated bundle links** — both flow through `createOrgBundleCheckoutSession()` in `apps/web/src/utils/bundle-checkout.ts` (~line 40), so one change covers both.

## Changes

- Add `allow_promotion_codes: true` to the two `stripe.checkout.sessions.create` call sites above.
- UI hint (one line each) in `apps/web/src/components/SubscriptionPanel.tsx` and `apps/web/src/components/OrgBundlePanel.tsx`: "Have a promo code? You can enter it at checkout."

## Explicitly unchanged

- **Webhook** (`app/api/stripe/webhook/route.ts`): syncs plan/status/tier from subscription metadata, not amounts. Discounted (even 100%-off) subscriptions fire the same events with the same metadata; `venue_subscriptions` / `org_subscriptions` sync is unaffected.
- **Database**: no new tables or migrations.
- **Plan cards**: continue to show list prices; the discount appears on Stripe's page.

## Coupon administration

Coupons (discount definition: percent/amount off, duration, e.g. "50% off for 3 months") and Promotion Codes (customer-facing strings, with per-code redemption limits and expiry) are created in the Stripe Dashboard. Stripe enforces validity, limits, and expiry inline on the hosted checkout page.

## Error handling

Entirely Stripe's: invalid, expired, or exhausted codes are rejected inline on the hosted checkout page before payment.

## Testing

- Unit: assert both session-creation call sites pass `allow_promotion_codes: true`. (Repo caveat: CI does not run `apps/web` `*.test.mjs` — validate locally.)
- End-to-end (test mode): create a test coupon + promotion code in Stripe, run a per-venue checkout and a bundle checkout, confirm the field appears and the discount applies to the subscription total.
