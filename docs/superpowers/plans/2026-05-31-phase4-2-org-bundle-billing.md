# Org Bundle Billing (Phase 4-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org owner/manager buy an org-wide bundle (quantity-based Stripe subscription) that populates `org_subscriptions`, cancels the org's per-venue subs, and keeps its Stripe quantity/price in sync as the org's venue count changes — making the 4.1 bundle override visible to real users.

**Architecture:** A new org-level checkout route creates a quantity-based subscription (`quantity = venue_count`, price = the bundle product). The existing webhook gains a branch that, for subs carrying `metadata.bundle_tier`, upserts `org_subscriptions` and cancels per-venue subs. A `syncBundleQuantity(orgId)` helper updates the Stripe subscription item (quantity, and price-swap on the 4↔5 threshold) when org venue membership changes. The 4.1 read path (`v_venue_active_tier` / `org_active_bundle_tier`) is unchanged.

**Tech Stack:** Next.js App Router (Node runtime), `stripe` SDK, Supabase (service-role in the webhook), Node test runner (`node --test test/*.mjs`, mirror + drift-guard convention).

**Spec:** `docs/superpowers/specs/2026-05-31-phase4-2-org-bundle-billing-design.md`

**⚠️ External prerequisite (blocks end-to-end / Stripe test-mode steps only):** create two Stripe products with recurring per-unit prices — `bundle_2_4` ($79/venue/mo), `bundle_5_plus` ($59/venue/mo) — and set `STRIPE_PRODUCT_BUNDLE_2_4` / `STRIPE_PRODUCT_BUNDLE_5_PLUS`. All code + unit tests below land without it; only the manual Stripe verification waits on it.

**Decision (from spec):** `venue_count` = **all** venues under the org (`venues.org_id = :orgId`), not just published.

---

## File Structure

- Create `apps/web/src/utils/bundle.ts` — pure sizing/pricing logic (tier, rate, preview). No I/O.
- Modify `apps/web/src/utils/stripe.ts` — `getPriceIdForBundle`; add bundle env vars to the config-error patterns.
- Modify `apps/web/src/utils/billing-access.ts` — `checkOrgBillingAccess`.
- Create `apps/web/src/app/api/stripe/org-checkout/route.ts` — org-level checkout.
- Modify `apps/web/src/app/api/stripe/webhook/route.ts` — `isOrgBundleSub` predicate + `handleOrgBundleUpsert` + dispatch branch + bundle `past_due` handling.
- Create `apps/web/src/utils/bundle-sync.ts` — `syncBundleQuantity(orgId)`.
- Modify venue-lifecycle server actions (audited in Task 7) — call `syncBundleQuantity`.
- Modify `ENV.md` — document the two bundle env vars.
- Create `test/bundle.test.mjs` — unit tests + drift guards for `bundle.ts` and the webhook routing predicate.

---

## Task 1: Pure bundle sizing/pricing logic

**Files:**
- Create: `apps/web/src/utils/bundle.ts`
- Test: `test/bundle.test.mjs`

- [ ] **Step 1: Write the failing test** (`test/bundle.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Mirror of apps/web/src/utils/bundle.ts (node:test can't import TS) ──
const RATE = { bundle_2_4: 7900, bundle_5_plus: 5900 };
function bundleTierForCount(n) {
  if (n >= 5) return "bundle_5_plus";
  if (n >= 2) return "bundle_2_4";
  return null;
}
function rateForBundleTier(tier) {
  return RATE[tier];
}
function previewBundleChange(currentCount, delta) {
  const newCount = currentCount + delta;
  const newTier = bundleTierForCount(newCount);
  return {
    newCount,
    newTier,
    monthlyTotalCents: newTier ? rateForBundleTier(newTier) * newCount : 0,
  };
}

test("bundleTierForCount maps counts to tiers with a <2 floor", () => {
  assert.equal(bundleTierForCount(0), null);
  assert.equal(bundleTierForCount(1), null);
  assert.equal(bundleTierForCount(2), "bundle_2_4");
  assert.equal(bundleTierForCount(4), "bundle_2_4");
  assert.equal(bundleTierForCount(5), "bundle_5_plus");
  assert.equal(bundleTierForCount(50), "bundle_5_plus");
});

test("rateForBundleTier returns the per-venue cents", () => {
  assert.equal(rateForBundleTier("bundle_2_4"), 7900);
  assert.equal(rateForBundleTier("bundle_5_plus"), 5900);
});

test("previewBundleChange crossing 4->5 drops the per-venue rate", () => {
  const before = previewBundleChange(4, 0);
  assert.deepEqual(before, { newCount: 4, newTier: "bundle_2_4", monthlyTotalCents: 7900 * 4 });
  const after = previewBundleChange(4, 1);
  assert.deepEqual(after, { newCount: 5, newTier: "bundle_5_plus", monthlyTotalCents: 5900 * 5 });
});

test("previewBundleChange below the floor is ineligible", () => {
  assert.deepEqual(previewBundleChange(1, 0), { newCount: 1, newTier: null, monthlyTotalCents: 0 });
});

// ── Drift guard: real bundle.ts keeps these invariants ──
const SRC = readFileSync(resolve(ROOT, "apps/web/src/utils/bundle.ts"), "utf8");
test("bundle.ts exports the sizing helpers with the same thresholds/rates", () => {
  assert.match(SRC, /export function bundleTierForCount/);
  assert.match(SRC, /export function rateForBundleTier/);
  assert.match(SRC, /export function previewBundleChange/);
  assert.match(SRC, /7900/);
  assert.match(SRC, /5900/);
  assert.match(SRC, />=\s*5/);
  assert.match(SRC, />=\s*2/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundle.test.mjs`
Expected: the mirror behavioral tests pass; the drift guard FAILS with ENOENT/`bundle.ts` missing.

- [ ] **Step 3: Write minimal implementation** (`apps/web/src/utils/bundle.ts`)

```ts
// Pure org-bundle sizing/pricing. No Stripe/DB calls — the deterministic core.
// bundle_2_4 = 2-4 venues @ $79/venue; bundle_5_plus = 5+ venues @ $59/venue.
export type BundleTier = "bundle_2_4" | "bundle_5_plus";

const RATE_CENTS: Record<BundleTier, number> = {
  bundle_2_4: 7900,
  bundle_5_plus: 5900,
};

/** Tier for a venue count; null when ineligible (<2). */
export function bundleTierForCount(n: number): BundleTier | null {
  if (n >= 5) return "bundle_5_plus";
  if (n >= 2) return "bundle_2_4";
  return null;
}

/** Per-venue monthly rate in cents. */
export function rateForBundleTier(tier: BundleTier): number {
  return RATE_CENTS[tier];
}

/** Preview a count change for the price-increase prompt (4-4). */
export function previewBundleChange(
  currentCount: number,
  delta: number
): { newCount: number; newTier: BundleTier | null; monthlyTotalCents: number } {
  const newCount = currentCount + delta;
  const newTier = bundleTierForCount(newCount);
  return {
    newCount,
    newTier,
    monthlyTotalCents: newTier ? rateForBundleTier(newTier) * newCount : 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bundle.test.mjs`
Expected: PASS (all). Then `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/bundle.ts test/bundle.test.mjs
git commit -m "feat(billing): pure org-bundle sizing/pricing helpers (Phase 4-2)"
```

---

## Task 2: Bundle price resolver in stripe.ts

**Files:**
- Modify: `apps/web/src/utils/stripe.ts`
- Test: `test/bundle.test.mjs` (extend the drift guard)

- [ ] **Step 1: Write the failing test** — append to `test/bundle.test.mjs`:

```js
const STRIPE_SRC = readFileSync(resolve(ROOT, "apps/web/src/utils/stripe.ts"), "utf8");
test("stripe.ts resolves bundle prices and guards the bundle env vars", () => {
  assert.match(STRIPE_SRC, /export async function getPriceIdForBundle/);
  assert.match(STRIPE_SRC, /STRIPE_PRODUCT_BUNDLE_2_4/);
  assert.match(STRIPE_SRC, /STRIPE_PRODUCT_BUNDLE_5_PLUS/);
  // bundle env vars included in the misconfiguration patterns
  assert.match(STRIPE_SRC, /BUNDLE_2_4\|BUNDLE_5_PLUS|BUNDLE_\(2_4\|5_PLUS\)|BUNDLE/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundle.test.mjs`
Expected: FAIL — `getPriceIdForBundle` / bundle env vars absent from `stripe.ts`.

- [ ] **Step 3: Write minimal implementation** — in `apps/web/src/utils/stripe.ts`:

Add `BUNDLE` to the config-error pattern (replace the existing product pattern line):

```ts
const STRIPE_CONFIG_ERROR_PATTERNS = [
  /^STRIPE_SECRET_KEY is not set$/,
  /^STRIPE_PRODUCT_(BASIC|FEATURED|PREMIUM|BUNDLE_2_4|BUNDLE_5_PLUS) is not set$/,
  /^No active recurring price found for product /,
];
```

Append after `getPriceIdForPlan`:

```ts
import type { BundleTier } from "./bundle";

const BUNDLE_PRODUCT_ENV: Record<BundleTier, string> = {
  bundle_2_4:    "STRIPE_PRODUCT_BUNDLE_2_4",
  bundle_5_plus: "STRIPE_PRODUCT_BUNDLE_5_PLUS",
};

/** First active recurring (per-unit) price id for the given bundle tier's product. */
export async function getPriceIdForBundle(tier: BundleTier): Promise<string> {
  const productId = process.env[BUNDLE_PRODUCT_ENV[tier]];
  if (!productId) throw new Error(`${BUNDLE_PRODUCT_ENV[tier]} is not set`);

  const stripe = getStripe();
  const prices = await stripe.prices.list({ product: productId, active: true, type: "recurring", limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`No active recurring price found for product ${productId} (${tier})`);
  return price.id;
}
```

(Put the `import type` with the other imports at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bundle.test.mjs` → PASS. `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/stripe.ts test/bundle.test.mjs
git commit -m "feat(billing): getPriceIdForBundle + bundle config-error guard (Phase 4-2)"
```

---

## Task 3: checkOrgBillingAccess

**Files:**
- Modify: `apps/web/src/utils/billing-access.ts`

- [ ] **Step 1: Write the failing test** — append to `test/bundle.test.mjs`:

```js
const ACCESS_SRC = readFileSync(resolve(ROOT, "apps/web/src/utils/billing-access.ts"), "utf8");
test("billing-access exposes an org-level check gated to owner/manager", () => {
  assert.match(ACCESS_SRC, /export async function checkOrgBillingAccess/);
  assert.match(ACCESS_SRC, /BILLING_MANAGER_ROLES/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundle.test.mjs`
Expected: FAIL — `checkOrgBillingAccess` not defined.

- [ ] **Step 3: Write minimal implementation** — in `apps/web/src/utils/billing-access.ts`, add after `checkVenueBillingAccess`:

```ts
export type OrgBillingAccessResult =
  | { allowed: true; isPlatformAdmin: boolean; role: string | null; venueCount: number }
  | { allowed: false; status: 400 | 403; error: string };

/** Org-level billing access: platform admin, or org_members.role in {owner, manager}. */
export async function checkOrgBillingAccess(
  supabase: SupabaseServerClient,
  user: User,
  orgId: string,
): Promise<OrgBillingAccessResult> {
  if (!orgId) return { allowed: false, status: 400, error: "orgId is required" };

  const isPlatformAdmin = await isAdminEmail(user.email);
  const serviceSupabase = isPlatformAdmin ? getOptionalServiceClient() : null;
  const lookupSupabase = serviceSupabase ?? supabase;

  const { count, error: countError } = await lookupSupabase
    .from("venues")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (countError) return { allowed: false, status: 403, error: "Forbidden" };
  const venueCount = count ?? 0;

  if (isPlatformAdmin && serviceSupabase) {
    return { allowed: true, isPlatformAdmin: true, role: null, venueCount };
  }

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = String(membership?.role ?? "");
  if (!BILLING_MANAGER_ROLES.has(role)) {
    return { allowed: false, status: 403, error: "Forbidden" };
  }
  return { allowed: true, isPlatformAdmin: false, role, venueCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bundle.test.mjs` → PASS. `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/billing-access.ts test/bundle.test.mjs
git commit -m "feat(billing): checkOrgBillingAccess (owner/manager) (Phase 4-2)"
```

---

## Task 4: Org checkout route

**Files:**
- Create: `apps/web/src/app/api/stripe/org-checkout/route.ts`

- [ ] **Step 1: Write the failing test** — append to `test/bundle.test.mjs`:

```js
const CHECKOUT_SRC = readFileSync(
  resolve(ROOT, "apps/web/src/app/api/stripe/org-checkout/route.ts"),
  "utf8",
);
test("org-checkout gates access, sizes the bundle, and tags subscription metadata", () => {
  assert.match(CHECKOUT_SRC, /checkOrgBillingAccess/);
  assert.match(CHECKOUT_SRC, /bundleTierForCount/);
  assert.match(CHECKOUT_SRC, /getPriceIdForBundle/);
  assert.match(CHECKOUT_SRC, /isTrustedBrowserRequest/);
  assert.match(CHECKOUT_SRC, /bundle_tier/);
  assert.match(CHECKOUT_SRC, /quantity/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundle.test.mjs`
Expected: FAIL — route file missing.

- [ ] **Step 3: Write minimal implementation** (`apps/web/src/app/api/stripe/org-checkout/route.ts`)

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/utils/supabase/server";
import {
  STRIPE_BILLING_CONFIG_ERROR,
  getStripe,
  getPriceIdForBundle,
  isStripeConfigurationError,
} from "@/utils/stripe";
import { bundleTierForCount } from "@/utils/bundle";
import { checkOrgBillingAccess } from "@/utils/billing-access";
import { getSafeAppOrigin, isTrustedBrowserRequest } from "@/utils/security";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!isTrustedBrowserRequest(req.headers)) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orgId } = (await req.json()) as { orgId: string };
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    const access = await checkOrgBillingAccess(supabase, user, orgId);
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

    const tier = bundleTierForCount(access.venueCount);
    if (!tier) {
      return NextResponse.json(
        { error: "A bundle needs at least 2 venues. Add venues or use per-venue plans." },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const billingSupabase = access.isPlatformAdmin ? createServiceClient() : supabase;

    const { data: existing } = await billingSupabase
      .from("org_subscriptions")
      .select("stripe_customer_id")
      .eq("org_id", orgId)
      .maybeSingle() as any;

    let customerId: string | undefined = existing?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { org_id: orgId, user_id: user.id },
      });
      customerId = customer.id;
    }

    const priceId = await getPriceIdForBundle(tier);
    const origin = getSafeAppOrigin(req.headers.get("origin"));
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: access.venueCount }],
      subscription_data: { metadata: { org_id: orgId, bundle_tier: tier } },
      success_url: `${origin}/orgs/${orgId}?bundle=success`,
      cancel_url: `${origin}/orgs/${orgId}?bundle=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/org-checkout]", err);
    return NextResponse.json(
      { error: isStripeConfigurationError(err) ? STRIPE_BILLING_CONFIG_ERROR : "Checkout failed. Please try again." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bundle.test.mjs` → PASS. `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/stripe/org-checkout/route.ts test/bundle.test.mjs
git commit -m "feat(billing): org bundle checkout route (Phase 4-2)"
```

---

## Task 5: Webhook branch + handleOrgBundleUpsert

**Files:**
- Modify: `apps/web/src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Write the failing test** — append to `test/bundle.test.mjs`:

```js
const WEBHOOK_SRC = readFileSync(
  resolve(ROOT, "apps/web/src/app/api/stripe/webhook/route.ts"),
  "utf8",
);
test("webhook routes bundle subs to the org path and cancels per-venue subs", () => {
  assert.match(WEBHOOK_SRC, /function isOrgBundleSub/);
  assert.match(WEBHOOK_SRC, /handleOrgBundleUpsert/);
  assert.match(WEBHOOK_SRC, /org_subscriptions/);
  // cancels the org's per-venue Stripe subs on activation
  assert.match(WEBHOOK_SRC, /subscriptions\.cancel/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundle.test.mjs`
Expected: FAIL — bundle handling absent from the webhook.

- [ ] **Step 3: Write minimal implementation** — in `apps/web/src/app/api/stripe/webhook/route.ts`:

Add imports near the top:

```ts
import { rateForBundleTier, type BundleTier } from "@/utils/bundle";
```

Add the predicate + handler (after `handleSubscriptionUpsert`):

```ts
function isOrgBundleSub(sub: Stripe.Subscription): boolean {
  return Boolean(sub.metadata?.bundle_tier) && !sub.metadata?.venue_id;
}

function isBundleTier(v: unknown): v is BundleTier {
  return v === "bundle_2_4" || v === "bundle_5_plus";
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
    console.warn("[webhook] bundle sub missing org_id/bundle_tier", sub.id);
    return;
  }

  const { data: org, error: orgErr } = await supabase
    .from("organizations").select("id").eq("id", orgId).maybeSingle();
  if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
  if (!org) { console.warn("[webhook] bundle org not found", sub.id); return; }

  const status = mapSubscriptionStatus(sub.status);
  const isActive = grantsPaidAccess(status);
  const venueCount = getSubscriptionQuantity(sub);
  const currentPeriodEnd = unixSecondsToIso((sub as any).current_period_end);

  const patch: Record<string, unknown> = {
    org_id: orgId,
    bundle_tier: tier,
    monthly_rate_per_venue_cents: rateForBundleTier(tier),
    venue_count: venueCount,
    status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
  };
  if (currentPeriodEnd) patch.current_period_end = currentPeriodEnd;

  const { error: upsertErr } = await (supabase as any)
    .from("org_subscriptions").upsert(patch, { onConflict: "org_id" });
  if (upsertErr) throw new Error(`org_subscriptions upsert failed: ${upsertErr.message}`);

  // On activation, cancel the org's per-venue Stripe subs so the org isn't double
  // billed. Cancelling fires customer.subscription.deleted, whose existing handler
  // zeros venue_subscriptions + promotion_tier. The bundle then supplies the
  // effective tier org-wide (4.1).
  if (isActive) {
    const { data: venueSubs } = await (supabase as any)
      .from("venue_subscriptions")
      .select("stripe_subscription_id, venues!inner(org_id)")
      .eq("venues.org_id", orgId)
      .not("stripe_subscription_id", "is", null)
      .neq("status", "canceled");
    for (const row of (venueSubs ?? []) as Array<{ stripe_subscription_id: string }>) {
      try {
        await getStripe().subscriptions.cancel(row.stripe_subscription_id);
      } catch (e) {
        console.warn("[webhook] per-venue cancel failed", row.stripe_subscription_id, e);
      }
    }
  }
}
```

In each of the three subscription-bearing event cases (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`), replace the single `await handleSubscriptionUpsert(...)` call with the branch:

```ts
        if (isOrgBundleSub(sub)) {
          await handleOrgBundleUpsert(supabase, sub, customerId);
        } else {
          await handleSubscriptionUpsert(supabase, sub, customerId);
        }
```

In `invoice.payment_failed`, after the existing `venue_subscriptions` update, also mark a matching bundle as past_due:

```ts
        await (supabase as any)
          .from("org_subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subId);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bundle.test.mjs` → PASS. `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/stripe/webhook/route.ts test/bundle.test.mjs
git commit -m "feat(billing): webhook writes org_subscriptions + cancels per-venue subs (Phase 4-2)"
```

---

## Task 6: syncBundleQuantity

**Files:**
- Create: `apps/web/src/utils/bundle-sync.ts`

- [ ] **Step 1: Write the failing test** — append to `test/bundle.test.mjs`:

```js
const SYNC_SRC = readFileSync(resolve(ROOT, "apps/web/src/utils/bundle-sync.ts"), "utf8");
test("bundle-sync updates Stripe quantity and swaps price on tier change", () => {
  assert.match(SYNC_SRC, /export async function syncBundleQuantity/);
  assert.match(SYNC_SRC, /bundleTierForCount/);
  assert.match(SYNC_SRC, /getPriceIdForBundle/);
  assert.match(SYNC_SRC, /subscriptions\.update|subscriptionItems\.update/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundle.test.mjs`
Expected: FAIL — `bundle-sync.ts` missing.

- [ ] **Step 3: Write minimal implementation** (`apps/web/src/utils/bundle-sync.ts`)

```ts
import { createServiceClient } from "@/utils/supabase/server";
import { getStripe, getPriceIdForBundle } from "@/utils/stripe";
import { bundleTierForCount } from "@/utils/bundle";

/**
 * Keep an org's active bundle subscription in sync with its venue count. Updates
 * the Stripe item quantity; if the count crosses 2..4 <-> 5+, swaps the item to
 * the other bundle product (the per-venue rate changes). org_subscriptions is
 * reconciled by the resulting customer.subscription.updated webhook (single
 * source of truth), so this does not write the table. No-op when the org has no
 * active bundle. Fail-open: logs and returns on any error.
 */
export async function syncBundleQuantity(orgId: string): Promise<void> {
  if (!orgId) return;
  const supabase = createServiceClient();

  const { data: bundle } = await (supabase as any)
    .from("org_subscriptions")
    .select("bundle_tier, stripe_subscription_id, status")
    .eq("org_id", orgId)
    .maybeSingle();

  const activeStatuses = new Set(["active", "trialing", "pilot"]);
  if (!bundle?.stripe_subscription_id || !activeStatuses.has(bundle.status)) return;

  const { count } = await (supabase as any)
    .from("venues")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  const newCount = count ?? 0;
  const newTier = bundleTierForCount(newCount);
  if (!newTier) return; // <2 venues: leave the subscription untouched (handle cancel elsewhere)

  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(bundle.stripe_subscription_id);
    const item = (sub as any).items?.data?.[0];
    if (!item) return;

    const update: any = { items: [{ id: item.id, quantity: newCount }] };
    if (newTier !== bundle.bundle_tier) {
      update.items[0].price = await getPriceIdForBundle(newTier);
    }
    await stripe.subscriptions.update(bundle.stripe_subscription_id, update);
  } catch (e) {
    console.warn("[bundle-sync] sync failed for org", orgId, e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bundle.test.mjs` → PASS. `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/bundle-sync.ts test/bundle.test.mjs
git commit -m "feat(billing): syncBundleQuantity (quantity + tier-swap) (Phase 4-2)"
```

---

## Task 7: Wire syncBundleQuantity into venue lifecycle

**Files:**
- Modify: the server actions that change `venues.org_id` membership. **Audit first:**
  `grep -rn "from('venues')\|insert\|delete\|org_id" apps/web/src/actions/venue-actions.ts apps/web/src/actions/admin-org-actions.ts apps/web/src/actions/organization-actions.ts`

- [ ] **Step 1: Identify the mutation points**

Run the grep above. For each action that **creates a venue under an org**, **deletes a venue**, or **reassigns `org_id`**, note the function and the point *after* the DB mutation succeeds.

- [ ] **Step 2: Add the sync call after each successful mutation**

At each identified point, after the venue insert/delete/reassignment succeeds, add:

```ts
import { syncBundleQuantity } from "@/utils/bundle-sync";
// ... after the mutation commits:
await syncBundleQuantity(orgId); // keep the org's bundle quantity/tier in sync
```

For a reassignment that moves a venue between orgs, call it for **both** the old and new `orgId`.

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit` → 0 errors. `node --test test/*.test.mjs` → all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/actions
git commit -m "feat(billing): sync bundle quantity on venue lifecycle changes (Phase 4-2)"
```

---

## Task 8: Document env vars

**Files:**
- Modify: `ENV.md`

- [ ] **Step 1: Add the bundle env vars** — under the Stripe "Server-only" list in `ENV.md`:

```markdown
- `STRIPE_PRODUCT_BUNDLE_2_4` — Stripe product ID for the org bundle of 2–4 venues ($79/venue/mo, recurring per-unit).
- `STRIPE_PRODUCT_BUNDLE_5_PLUS` — Stripe product ID for the org bundle of 5+ venues ($59/venue/mo, recurring per-unit).
```

- [ ] **Step 2: Commit**

```bash
git add ENV.md
git commit -m "docs(env): document org bundle Stripe product vars (Phase 4-2)"
```

---

## Manual Stripe test-mode verification (after the external products exist)

> Gated on `STRIPE_PRODUCT_BUNDLE_2_4` / `STRIPE_PRODUCT_BUNDLE_5_PLUS` being set to real test-mode products. Run with the Stripe CLI forwarding to `/api/stripe/webhook`.

1. As an org owner with ≥2 venues, `POST /api/stripe/org-checkout { orgId }`, complete checkout with a test card.
2. Confirm `org_subscriptions` has a row (`status=active`, `venue_count`, `bundle_tier`, stripe ids).
3. Confirm the org's venues read featured-level in the directory (`v_venue_active_tier`), and any prior per-venue subs are now `canceled` with `promotion_tier=null`.
4. Add a venue → Stripe quantity bumps; cross 4→5 → price swaps to `bundle_5_plus` and `monthly_rate_per_venue_cents` becomes 5900.
5. Cancel the bundle in Stripe → `org_subscriptions.status=canceled`, elevation reverts to each venue's own tier.

---

## Final verification gates

- `npm test` (root) → green, including all of `test/bundle.test.mjs`.
- `cd apps/web && npx tsc --noEmit` → 0 errors.
- Stripe paths verified in test mode once the products exist.
