# Phase 4-2 — Org Bundle Billing (org-wide) — Design

**Date:** 2026-05-31
**Status:** Approved design, pre-implementation.
**Branch HEAD at authoring:** `master` `6c04408` (4.1 + 4-1b read path merged + pushed;
the `v_venue_active_tier` org-bundle override is live and anon-verified).

## Context

The Phase 4 read path (4.1 web, 4-1b mobile) elevates an org's venues to featured-level
when the org has an active bundle in `org_subscriptions` — but nothing populates that table.
This sub-project wires the **billing** that does: org-level Stripe checkout + a webhook that
writes `org_subscriptions`. It is the piece that makes the override visible to real users.

### Decisions locked in (brainstorm)

- **Org-wide bundle** — a bundle lifts *all* the org's venues. The 4.1 read path
  (`org_active_bundle_tier(org_id)`, matched on `org_id` with no venue filter) is **unchanged**.
  Per-venue *subset* selection is explicitly deferred ("nice later, too much now").
- **Bundle cancels per-venue subs** — on bundle activation the webhook cancels the org's
  per-venue Stripe subscriptions so the org is not double-billed.
- **Quantity sync included** — when the org's venue count changes, the bundle's Stripe
  quantity updates; crossing the 4↔5 threshold swaps the price/tier (the per-venue rate
  changes). The primary trigger (claim/add-existing-venue) is a later sub-project (4-4); 4-2
  builds the sync mechanism and wires it into the venue lifecycle points that exist today.
- **Out of scope (own sub-projects):** claim/add-existing-venue + the price-increase prompt UI
  (4-4); per-venue subset selection (future); org bundle management UI (4-3); whether push edge
  functions honor bundles (revisit with push work).

> **CONFIRM AT REVIEW — `venue_count` basis.** Default chosen: **all** venues under the org
> (`venues.org_id = :orgId`), not just published ones — matching the "take on a venue → price
> increases" framing. The alternative (published/live only) would mean drafts don't bill until
> published. Every "count the org's venues" below uses this basis; flip it here if wrong.

### ⚠️ External dependency (blocks end-to-end verification)

Two Stripe **products/prices** must be created in the Stripe dashboard before checkout works:

| Bundle | Per-venue price | Env var |
| --- | --- | --- |
| `bundle_2_4` (2–4 venues) | $79 / venue / month, recurring per-unit | `STRIPE_PRODUCT_BUNDLE_2_4` |
| `bundle_5_plus` (≥5 venues) | $59 / venue / month, recurring per-unit | `STRIPE_PRODUCT_BUNDLE_5_PLUS` |

Documented in `ENV.md`. Until set, the code surfaces the existing
`STRIPE_BILLING_CONFIG_ERROR` (no crash). Pricing is quantity-based: subscription quantity =
`venue_count`, unit price = the bundle product's recurring price.

## Pricing model (Stripe)

A bundle is one **quantity-based subscription** on the org's Stripe customer:
- One subscription item: price = the bundle product's recurring per-unit price; `quantity` =
  the org's venue count.
- Tier (`bundle_2_4` vs `bundle_5_plus`) selects *which product/price* — they are different unit
  prices, so a tier change is a **price swap on the subscription item**, not just a quantity bump.
- `unique (org_id)` on `org_subscriptions` ⇒ at most one bundle per org.

## Components

### 1. Pure sizing logic — `apps/web/src/utils/bundle.ts` (NEW, fully unit-testable)

```ts
export type BundleTier = 'bundle_2_4' | 'bundle_5_plus';

/** Tier for a venue count; null when ineligible (<2). */
export function bundleTierForCount(n: number): BundleTier | null;   // 2..4 → 2_4, ≥5 → 5_plus, else null

/** Per-venue monthly rate in cents. */
export function rateForBundleTier(tier: BundleTier): number;        // 7900 / 5900

/** Preview a count change for the price-increase prompt. */
export function previewBundleChange(
  currentCount: number,
  delta: number
): { newCount: number; newTier: BundleTier | null; monthlyTotalCents: number };
```

No Stripe/DB calls — the deterministic core the tests pin.

### 2. Bundle price resolver — `apps/web/src/utils/stripe.ts` (extend)

`getPriceIdForBundle(tier)` mirrors `getPriceIdForPlan`: maps tier → env var
(`STRIPE_PRODUCT_BUNDLE_2_4` / `STRIPE_PRODUCT_BUNDLE_5_PLUS`), lists the active recurring price.
Add the bundle env vars to `STRIPE_CONFIG_ERROR_PATTERNS`.

### 3. Org billing access — `apps/web/src/utils/billing-access.ts` (extend)

`checkOrgBillingAccess(supabase, user, orgId)` mirrors `checkVenueBillingAccess`: platform admin
(service client) OR `org_members.role ∈ {owner, manager}`. Returns the org + venue count or a
403/400. Reuses `BILLING_MANAGER_ROLES`.

### 4. Checkout route — `apps/web/src/app/api/stripe/org-checkout/route.ts` (NEW)

`POST { orgId }`, `runtime = 'nodejs'`:
1. `isTrustedBrowserRequest` origin check (mirror the venue route) → 403 otherwise.
2. `auth.getUser()` → 401 if absent.
3. `checkOrgBillingAccess` → 403/400 on denial.
4. Count the org's venues → `bundleTierForCount` → reject (<2) with a clear error.
5. Reuse/create the org Stripe customer (stored on `org_subscriptions.stripe_customer_id`;
   metadata `{ org_id }`).
6. `getPriceIdForBundle(tier)` → `checkout.sessions.create` mode `subscription`, customer, one
   line item `{ price, quantity: venue_count }`, `subscription_data.metadata { org_id, bundle_tier }`,
   success/cancel URLs to the org page.
7. Config errors → `STRIPE_BILLING_CONFIG_ERROR`; others → generic 500 (mirror venue route).

### 5. Webhook branching — `apps/web/src/app/api/stripe/webhook/route.ts` (extend)

The event handlers stay; dispatch inside them branches on subscription metadata:
- `metadata.bundle_tier` present (and no `venue_id`) → `handleOrgBundleUpsert(supabase, sub, customerId)`.
- else → existing `handleSubscriptionUpsert` (venue path), unchanged.

`handleOrgBundleUpsert`:
1. Require `metadata.org_id` + a valid `bundle_tier`; verify the org exists.
2. `mapSubscriptionStatus(sub.status)`; quantity → `venue_count`; `current_period_end`.
3. Upsert `org_subscriptions` (onConflict `org_id`): `bundle_tier`, `monthly_rate_per_venue_cents`
   = `rateForBundleTier`, `venue_count`, `status`, `current_period_end`, stripe ids.
4. **On `grantsPaidAccess(status)`:** cancel the org's per-venue Stripe subs — look up
   `venue_subscriptions` rows for the org's venues with a `stripe_subscription_id`, call
   `stripe.subscriptions.cancel(id)` for each. That fires the existing
   `customer.subscription.deleted` handler, which sets those `venue_subscriptions` to `canceled`
   and `promotion_tier` to null. The bundle then supplies the effective tier org-wide (4.1), so
   display is preserved with no double-billing.

`invoice.payment_failed` for a bundle sub → set `org_subscriptions.status = 'past_due'` (the
read path's active-status gate drops it, reverting elevation).

### 6. Quantity sync — `apps/web/src/utils/bundle-sync.ts` (NEW)

`syncBundleQuantity(orgId)` (service-role): recount the org's venues → if the org has an active
bundle sub:
- `newTier = bundleTierForCount(newCount)`.
- If `newTier` differs from the current tier → update the subscription item to the new bundle
  **price** (swap) and set `quantity = newCount`.
- Else update the item `quantity = newCount`.
- `org_subscriptions` is reconciled by the resulting `customer.subscription.updated` webhook
  (single source of truth), so this function does not also write the table.

Wire `syncBundleQuantity(orgId)` into the venue lifecycle server actions that change org venue
membership today (`venue-actions.ts`, `admin-org-actions.ts`, `organization-actions.ts` — audited
during implementation). 4-4 (claim venue) will also call it and surface `previewBundleChange` as
the price-increase prompt.

## Data flow

```
org owner ──POST /api/stripe/org-checkout {orgId}
   │  checkOrgBillingAccess → count venues → bundleTierForCount → getPriceIdForBundle
   ▼
Stripe Checkout (subscription, quantity = venue_count, metadata {org_id, bundle_tier})
   │  completed / updated / invoice.* webhooks
   ▼
/api/stripe/webhook → handleOrgBundleUpsert
   ├─ upsert org_subscriptions (status, venue_count, rate, stripe ids)
   └─ on active: cancel org's per-venue subs → existing handler zeros venue_subscriptions + promotion_tier
   ▼
v_venue_active_tier (4.1, unchanged) → org's venues read featured-level

venue added/removed ──server action──► syncBundleQuantity(orgId)
   └─ update Stripe item quantity (+ price swap on 4↔5) ──► subscription.updated webhook ──► org_subscriptions reconciled
```

## Env / config

Add to `ENV.md` (server-only, required for org bundle billing): `STRIPE_PRODUCT_BUNDLE_2_4`,
`STRIPE_PRODUCT_BUNDLE_5_PLUS`. Note `STRIPE_PRODUCT_PREMIUM` remains unused (per existing TODO).

## Testing

- **Unit (`bundle.ts`):** `bundleTierForCount` boundaries (0,1,2,4,5,…), `rateForBundleTier`,
  `previewBundleChange` math incl. threshold-cross rate change. Pure, in `test/*.mjs`
  (mirror + drift guard against the real source, per repo convention).
- **Webhook routing guard:** a sub with `metadata.bundle_tier` routes to the org path; a venue
  sub stays on the venue path (assert the dispatch predicate; pure).
- **Migration/grant guard:** none (no schema change — `org_subscriptions` already exists).
- **Manual Stripe test-mode (documented, gated on the external products):** complete an
  org-checkout in test mode → `org_subscriptions` row written, the org's venues read
  featured-level in the directory, and any prior per-venue subs are canceled
  (`venue_subscriptions` → canceled, `promotion_tier` → null). Add a venue → quantity bumps;
  cross 4→5 → price swaps to `bundle_5_plus`. Cancel the bundle → elevation reverts.

## Verification gates

- `npm test` green (existing + new unit/routing tests).
- `cd apps/web && npm run typecheck` (or `npx tsc --noEmit`) 0 errors.
- Stripe paths verified in **test mode** once the bundle products exist (external dependency).

## Rollback

Code is additive: new route, new utils, a webhook branch, and sync wiring. Revert the commits;
no schema migration. In-flight bundle subs in Stripe would be orphaned from the app but cause no
app errors (the webhook branch simply no longer runs). Cancel any test-mode subs in Stripe.

## Security

- Checkout gated to org owner/manager (or platform admin) via `checkOrgBillingAccess` +
  `isTrustedBrowserRequest` origin check.
- Webhook signature verification is the existing `verifyWebhookEvent` (unchanged).
- Per-venue cancellation and `org_subscriptions` writes run service-role inside the
  signature-verified webhook only; no client writes `org_subscriptions` (RLS already
  authenticated-read-only, service-role write).
