# Phase 4-3 — Org Bundle Management UI — Design

**Date:** 2026-05-31
**Status:** Approved design, pre-implementation.
**Branch HEAD at authoring:** `master` `b23cbd5` (4.1 + 4-1b + 4-2 merged; 4-2 fully
behavior-verified in test mode, dormant in prod pending this UI).

## Context

Phase 4-2 shipped the org bundle billing backend (org-checkout route, webhook →
`org_subscriptions`, per-venue cancellation, quantity/tier sync) and it is fully verified in
test mode — but there is **no UI to view, start, or manage a bundle**, so it can't be activated
for real users (the decision recorded in `TODO.md`: wire live *alongside* this sub-project).
4-3 builds that UI, on two surfaces.

### Decisions locked in (brainstorm)

- **Two surfaces:** org-owner self-serve panel **and** admin acts-on-behalf.
- **Manage/cancel split:** owners use the **Stripe billing portal**; admins (not the customer)
  get **in-app** cancel. Both show the "cancelling drops all venues to Listed" warning.
- **Admin "start" = both** comp a pilot bundle (no charge) **OR** generate a checkout link for the
  owner (who pays). Plus admin cancel + view.
- **Org-wide bundle, no venue selection** (from 4-2). Start covers all the org's venues.
- **Shippable in two phases:** owner panel (+ org-portal route) first, then the admin surface.

## Architecture

```
orgs/[orgId]/page.tsx (server)
  ├─ checkOrgBillingAccess(user, orgId) → { allowed, role, venueCount }   (reused)
  ├─ load org_subscriptions row (active bundle, if any)
  └─ <OrgBundlePanel> (client) — owners/managers/platform-admins only
        ├─ no bundle → "Start bundle" → POST /api/stripe/org-checkout → redirect
        │     (disabled <2 venues; live price preview via @/utils/bundle pure fns)
        └─ active   → status card + "Manage billing" → POST /api/stripe/org-portal → Stripe portal

admin/plans/page.tsx (server, service role)
  └─ Org Bundles table (all org_subscriptions + org name + venue counts)
        ├─ Grant pilot comp   → adminGrantPilotBundle(orgId)
        ├─ Generate link      → adminCreateBundleCheckoutLink(orgId) → URL to copy
        └─ Cancel             → adminCancelOrgBundle(orgId)  (confirm + warning)
```

## Components

### 1. `apps/web/src/components/OrgBundlePanel.tsx` (NEW, client)

Mirrors `SubscriptionPanel`'s structure/styling. Props:
`{ orgId: string; venueCount: number; bundle: OrgBundleSummary | null }` where
`OrgBundleSummary = { tier, status, venueCount, monthlyRatePerVenueCents, currentPeriodEnd }`.

- **No active bundle:** a "Start a bundle" CTA. If `venueCount < 2`, the button is disabled with
  "A bundle needs at least 2 venues." Otherwise show a preview from the pure helpers
  (`bundleTierForCount(venueCount)` + `rateForBundleTier` → "N venues × $R = $T/mo (Tier)").
  Click → `POST /api/stripe/org-checkout { orgId }` → `window.location.href = data.url`.
- **Active bundle:** status card (tier label, `venueCount`, $/venue, monthly total, status,
  renewal date) + "Manage billing" → `POST /api/stripe/org-portal { orgId }` → redirect. A muted
  note: "Cancelling your bundle returns all venues to Listed."
- Error + pending handling via `useState`/`useTransition`, matching `SubscriptionPanel`.

### 2. `apps/web/src/app/api/stripe/org-portal/route.ts` (NEW)

Direct mirror of `app/api/stripe/portal/route.ts`, org-scoped:
`isTrustedBrowserRequest` → `auth.getUser()` → `checkOrgBillingAccess(supabase, user, orgId)` →
read `org_subscriptions.stripe_customer_id` (404 if none) → `billingPortal.sessions.create({
customer, return_url: ${origin}/orgs/${orgId} })`. Config errors → `STRIPE_BILLING_CONFIG_ERROR`.

### 3. Org page wiring — `apps/web/src/app/orgs/[orgId]/page.tsx` (MODIFY)

After the existing access resolution, call `checkOrgBillingAccess` (or reuse what the page already
loads) to get `venueCount` + the viewer's role; load the org's `org_subscriptions` row via the
service/role-appropriate client; render `<OrgBundlePanel>` when the viewer is owner/manager or a
platform admin. Place it near the org's billing/venue section.

### 4. Shared checkout-session helper — `apps/web/src/utils/bundle-checkout.ts` (NEW)

Extract the Stripe Checkout Session construction currently inline in `org-checkout/route.ts` into
`createOrgBundleCheckoutSession({ orgId, venueCount, customerId?, origin, billingSupabase })`:
reuse/create the org customer, `getPriceIdForBundle(bundleTierForCount(venueCount))`,
`checkout.sessions.create(... quantity: venueCount, subscription_data.metadata {org_id, bundle_tier})`,
return `{ url, sessionId }`. The `org-checkout` route and the admin "generate link" action both call
it (DRY). Refactor the route to use it (behavior unchanged — re-verify with the existing tests).

### 5. Admin surface — `apps/web/src/app/admin/plans/page.tsx` (MODIFY) + new actions

Add an **Org Bundles** table (server, service client): rows from `org_subscriptions` joined to
`organizations.name`, plus the org's venue count, showing tier / status / `venue_count` / monthly
total / renewal. New server actions in `apps/web/src/actions/admin-plans-actions.ts` (or a new
`admin-bundle-actions.ts`), all admin-gated (`isAdmin()` / service role, mirroring existing admin
actions):
- **`adminGrantPilotBundle(orgId)`** — count org venues → `bundleTierForCount` (reject <2) → upsert
  `org_subscriptions` (`status='pilot'`, `bundle_tier`, `monthly_rate_per_venue_cents`, `venue_count`,
  **no** `stripe_subscription_id`). No Stripe call. The read path's active-gate already honors `pilot`.
- **`adminCreateBundleCheckoutLink(orgId)`** — call `createOrgBundleCheckoutSession` (service client),
  return the URL for staff to copy/send to the owner.
- **`adminCancelOrgBundle(orgId)`** — if `org_subscriptions.stripe_subscription_id` is set,
  `stripe.subscriptions.cancel(id)` (webhook flips it to canceled); if it's a pilot comp (no Stripe
  sub), set `status='canceled'` directly. Client confirm dialog carries the all-listed warning.

## Data flow

```
Owner starts paid bundle:  panel → org-checkout (shared helper) → Stripe Checkout → webhook → org_subscriptions
Owner manages/cancels:     panel → org-portal → Stripe billing portal (cancel) → webhook → org_subscriptions
Admin comps pilot:         admin action → org_subscriptions (status=pilot, no Stripe) → read path elevates
Admin sends link:          admin action → org-checkout session URL → owner completes → webhook
Admin cancels:             admin action → subscriptions.cancel (or status=canceled for pilot) → read path drops
```

## Testing

- **Pure:** `@/utils/bundle` already unit-tested (tier/rate/preview); the panel preview + admin
  grant reuse it.
- **Route guard (`test/*.mjs`, source-grep, repo convention):** `org-portal` route uses
  `checkOrgBillingAccess`, reads `org_subscriptions.stripe_customer_id`, calls
  `billingPortal.sessions.create`; `bundle-checkout.ts` exports `createOrgBundleCheckoutSession`
  and `org-checkout/route.ts` consumes it.
- **Admin action guards:** `adminGrantPilotBundle` writes `status` `'pilot'` + rejects `<2`;
  `adminCancelOrgBundle` calls `subscriptions.cancel` and handles the no-Stripe (pilot) case;
  `adminCreateBundleCheckoutLink` uses the shared helper.
- **No React component tests** — consistent with the repo (none exist). UI verified via typecheck +
  manual test-mode click-through with the existing test products.

## Verification gates

- `npm test` green (existing + new guards).
- `cd apps/web && npx tsc --noEmit` 0 errors.
- Manual (test mode, dev server + `stripe listen`): owner panel start → checkout → bundle shows
  active + venues elevate; manage → portal; admin grant pilot → org elevates with `pilot`; admin
  generate link → URL completes a checkout; admin cancel → reverts to Listed.

## Rollback

Additive: new component, new route, new util, new admin actions + table, plus a behavior-preserving
refactor of `org-checkout` to the shared helper. Revert the commits; no schema migration.

## Out of scope (own sub-projects)

- Live activation (create live products + set prod env) — done *with* this UI's deploy, per the
  recorded decision; not code.
- Claim/add-existing-venue + price-increase prompt (4-4).
- Per-venue subset selection (future).
- Update-payment-method outside the Stripe portal (owners use the portal).
