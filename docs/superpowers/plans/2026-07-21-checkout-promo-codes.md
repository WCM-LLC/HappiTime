# Checkout Promo Codes (Stripe-native) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Venue owners can enter Stripe promotion codes on the hosted checkout page for every subscription checkout the app creates.

**Architecture:** Set `allow_promotion_codes: true` on both `stripe.checkout.sessions.create` call sites (per-venue checkout route + shared org-bundle helper). Add a one-line hint in the two panels that launch checkout. Coupons/promotion codes themselves live in the Stripe Dashboard; the webhook and DB are untouched.

**Tech Stack:** Next.js App Router (apps/web), Stripe Node SDK, `node:test` for the guardrail test.

**Spec:** `docs/superpowers/specs/2026-07-21-checkout-promo-codes-design.md`

## Global Constraints

- Branch: `feature/checkout-promo-codes` (already created; spec committed on it). Master is branch-protected — land via squash-merge PR.
- CI does NOT run `apps/web` `*.test.mjs`, lint, or typecheck for the web app in all paths — run `node --test` and `npm run typecheck --workspace apps/web` locally before declaring done.
- Do NOT add `discounts: [...]` to any session — mutually exclusive with `allow_promotion_codes` in Stripe's API.
- No DB migrations, no webhook changes.
- Hint copy, verbatim: `Have a promo code? You can enter it at checkout.`

---

### Task 1: Enable promotion codes on both Checkout Session call sites

**Files:**
- Test (create): `apps/web/src/utils/stripe-promo-codes.test.mjs`
- Modify: `apps/web/src/app/api/stripe/checkout/route.ts:63-72`
- Modify: `apps/web/src/utils/bundle-checkout.ts:40-47`

**Interfaces:**
- Consumes: existing `stripe.checkout.sessions.create` calls.
- Produces: both calls include `allow_promotion_codes: true`. No signature changes; nothing downstream reads this.

**Note on test design:** `apps/web` tests are plain `node --test` `.mjs` files (see `src/lib/socialUrl.test.mjs`); there is no TS test harness, so the route can't be imported and Stripe can't be spied on without new infra. This test is a source guardrail: it reads both call-site files and asserts the flag is present, so a future refactor that drops it fails the test.

- [ ] **Step 1: Write the failing guardrail test**

Create `apps/web/src/utils/stripe-promo-codes.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Guardrail: every Checkout Session the app creates must let customers
// enter a Stripe promotion code (spec 2026-07-21-checkout-promo-codes).
// Plain node:test can't import the TS routes, so assert on source.
const CALL_SITES = [
  "../app/api/stripe/checkout/route.ts",
  "./bundle-checkout.ts",
];

for (const rel of CALL_SITES) {
  test(`${rel} enables allow_promotion_codes`, () => {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    assert.match(src, /allow_promotion_codes:\s*true/);
    assert.doesNotMatch(src, /discounts\s*:/, "discounts is mutually exclusive with allow_promotion_codes");
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test src/utils/stripe-promo-codes.test.mjs`
Expected: 2 tests FAIL (`allow_promotion_codes` not found in either file).

- [ ] **Step 3: Add the flag to the per-venue checkout route**

In `apps/web/src/app/api/stripe/checkout/route.ts`, the session call becomes:

```ts
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { venue_id: venueId, org_id: orgId, plan },
      },
      success_url: `${origin}/orgs/${orgId}/venues/${venueId}/subscription?subscription=success`,
      cancel_url:  `${origin}/orgs/${orgId}/venues/${venueId}/subscription?subscription=cancelled`,
    });
```

- [ ] **Step 4: Add the flag to the bundle checkout helper**

In `apps/web/src/utils/bundle-checkout.ts`, the session call becomes:

```ts
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { org_id: orgId, bundle_tier: tier } },
    success_url: `${origin}/orgs/${orgId}?bundle=success`,
    cancel_url: `${origin}/orgs/${orgId}?bundle=cancelled`,
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && node --test src/utils/stripe-promo-codes.test.mjs`
Expected: 2 tests PASS.

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: exit 0 (the field is a valid `Stripe.Checkout.SessionCreateParams` property).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/utils/stripe-promo-codes.test.mjs apps/web/src/app/api/stripe/checkout/route.ts apps/web/src/utils/bundle-checkout.ts
git commit -m "feat(billing): accept Stripe promotion codes on all checkout sessions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: "Enter it at checkout" hints in the two checkout panels

**Files:**
- Modify: `apps/web/src/components/SubscriptionPanel.tsx:108,155` (plan-cards grid)
- Modify: `apps/web/src/components/OrgBundlePanel.tsx:136-143` (StartBundle button)

**Interfaces:**
- Consumes: nothing from Task 1 (independent copy change).
- Produces: static hint text only; no props or state changes.

- [ ] **Step 1: Add hint below the plan cards in SubscriptionPanel**

In `apps/web/src/components/SubscriptionPanel.tsx`, change the grid's `mb-8` to `mb-2` and insert the hint after the grid's closing `</div>` (currently line 155):

```tsx
      {/* Plan cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
```

```tsx
      </div>
      <p className="text-caption text-muted mb-8">Have a promo code? You can enter it at checkout.</p>
```

- [ ] **Step 2: Add hint below the Start bundle button in OrgBundlePanel**

In `apps/web/src/components/OrgBundlePanel.tsx`, inside `StartBundle`, after the `<button>…</button>` add:

```tsx
      <p className="mt-3 text-caption text-muted">Have a promo code? You can enter it at checkout.</p>
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd apps/web && npm run typecheck && npm run lint`
Expected: exit 0 for typecheck; lint passes (or reports only pre-existing warnings untouched by this change).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/SubscriptionPanel.tsx apps/web/src/components/OrgBundlePanel.tsx
git commit -m "feat(billing): promo-code hint on subscription and bundle panels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: End-to-end verification (Stripe test mode) + PR

**Files:** none (verification + PR only).

**Interfaces:**
- Consumes: Tasks 1–2 deployed to a local dev run.
- Produces: verified behavior; PR ready for review.

- [ ] **Step 1: Verify the promo-code field appears on hosted checkout**

With test-mode Stripe keys in `apps/web/.env.local`: run `npm run dev` in `apps/web`, open a venue's `/orgs/[orgId]/venues/[venueId]/subscription`, click Upgrade, and confirm the Stripe-hosted page shows an "Add promotion code" link. Repeat for an org bundle (`Start bundle`). If no test-mode coupon exists yet, create one in the Stripe Dashboard (test mode → Products → Coupons → e.g. `TEST50`, 50% off, once) with a promotion code, apply it, and confirm the total updates. Do NOT complete a live-mode payment.

- [ ] **Step 2: Open PR**

```bash
git push -u origin feature/checkout-promo-codes
gh pr create --title "feat(billing): Stripe promotion codes at checkout" --body "$(cat <<'EOF'
## Summary
- Enable Stripe's built-in "Add promotion code" field on all subscription checkouts (per-venue plans, org bundles, admin-generated bundle links) via `allow_promotion_codes: true`
- Guardrail test asserting both session call sites keep the flag (and never add the mutually-exclusive `discounts`)
- One-line "enter it at checkout" hint on SubscriptionPanel and OrgBundlePanel
- Spec: docs/superpowers/specs/2026-07-21-checkout-promo-codes-design.md

## Test plan
- [x] `node --test src/utils/stripe-promo-codes.test.mjs` (local — CI doesn't run apps/web tests)
- [x] `npm run typecheck` in apps/web
- [x] Test-mode checkout shows promo field and applies a test coupon

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens against `master`; required checks (node/supabase-migrations) run and must be green before squash-merge.
