# Org Bundle Management UI (Phase 4-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give org owners a self-serve bundle panel (view/start/manage) and admins an acts-on-behalf surface (view/comp-pilot/generate-link/cancel), surfacing the 4-2 billing backend so bundles can be sold.

**Architecture:** Owners use a client `OrgBundlePanel` on the org page that starts a bundle via the existing `/api/stripe/org-checkout` and manages it via a new `/api/stripe/org-portal` (Stripe billing portal). Admins use new server actions on the `admin/plans` page. A shared `createOrgBundleCheckoutSession` helper (extracted from the org-checkout route) is reused by the route and the admin link-generator. No schema changes.

**Tech Stack:** Next.js App Router (server components + client components + server actions), `stripe` SDK, Supabase, Node test runner (`node --test test/*.mjs`, source-grep guard convention). Pure helpers in `@/utils/bundle` (already unit-tested).

**Spec:** `docs/superpowers/specs/2026-05-31-phase4-3-org-bundle-management-ui-design.md`

**Phasing:** Tasks 1–4 = owner panel (shippable alone). Tasks 5–6 = admin surface.

---

## File Structure

- Create `apps/web/src/utils/bundle-checkout.ts` — `createOrgBundleCheckoutSession` (shared session builder).
- Modify `apps/web/src/app/api/stripe/org-checkout/route.ts` — call the shared helper (behavior-preserving).
- Create `apps/web/src/app/api/stripe/org-portal/route.ts` — org-level Stripe billing portal.
- Create `apps/web/src/components/OrgBundlePanel.tsx` — owner client panel.
- Modify `apps/web/src/app/orgs/[orgId]/page.tsx` — load bundle + render the panel for owner/manager/admin.
- Create `apps/web/src/actions/admin-bundle-actions.ts` — `adminGrantPilotBundle`, `adminCreateBundleCheckoutLink`, `adminCancelOrgBundle`.
- Modify `apps/web/src/app/admin/plans/page.tsx` — Org Bundles table + action buttons.
- Create `test/org-bundle-ui.test.mjs` — source-grep guard tests for the helper, route, and actions.

---

## Task 1: Shared checkout-session helper + refactor org-checkout

**Files:**
- Create: `apps/web/src/utils/bundle-checkout.ts`
- Modify: `apps/web/src/app/api/stripe/org-checkout/route.ts`
- Test: `test/org-bundle-ui.test.mjs`

- [ ] **Step 1: Write the failing test** (`test/org-bundle-ui.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

test("bundle-checkout exports the shared session builder and the route uses it", () => {
  const helper = read("apps/web/src/utils/bundle-checkout.ts");
  assert.match(helper, /export async function createOrgBundleCheckoutSession/);
  assert.match(helper, /checkout\.sessions\.create/);
  assert.match(helper, /bundle_tier/);
  assert.match(helper, /quantity/);

  const route = read("apps/web/src/app/api/stripe/org-checkout/route.ts");
  assert.match(route, /createOrgBundleCheckoutSession/);
  assert.ok(
    !/checkout\.sessions\.create/.test(route),
    "org-checkout route should delegate session creation to the helper",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/org-bundle-ui.test.mjs`
Expected: FAIL — `bundle-checkout.ts` missing.

- [ ] **Step 3: Write the helper** (`apps/web/src/utils/bundle-checkout.ts`)

```ts
import { getStripe, getPriceIdForBundle } from '@/utils/stripe';
import type { BundleTier } from '@/utils/bundle';

type SessionOpts = {
  orgId: string;
  tier: BundleTier;
  quantity: number;
  customerEmail: string | null;
  /** Supabase client used to read/store the org's Stripe customer id. */
  billingSupabase: any;
  origin: string;
};

/**
 * Build a subscription Checkout Session for an org bundle. Reuses the org's
 * existing Stripe customer (org_subscriptions.stripe_customer_id) or creates one.
 * Shared by /api/stripe/org-checkout and the admin "generate link" action.
 */
export async function createOrgBundleCheckoutSession(opts: SessionOpts): Promise<{ url: string | null; sessionId: string }> {
  const { orgId, tier, quantity, customerEmail, billingSupabase, origin } = opts;
  const stripe = getStripe();

  const { data: existing } = await billingSupabase
    .from('org_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  let customerId: string | undefined = existing?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: customerEmail ?? undefined,
      metadata: { org_id: orgId },
    });
    customerId = customer.id;
  }

  const priceId = await getPriceIdForBundle(tier);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    subscription_data: { metadata: { org_id: orgId, bundle_tier: tier } },
    success_url: `${origin}/orgs/${orgId}?bundle=success`,
    cancel_url: `${origin}/orgs/${orgId}?bundle=cancelled`,
  });

  return { url: session.url, sessionId: session.id };
}
```

- [ ] **Step 4: Refactor the route to use it** — in `apps/web/src/app/api/stripe/org-checkout/route.ts`, replace the customer/price/session block (everything from `const stripe = getStripe();` through the `stripe.checkout.sessions.create({...})` and its `return NextResponse.json({ url: session.url })`) with:

```ts
    const billingSupabase = access.isPlatformAdmin ? createServiceClient() : supabase;
    const origin = getSafeAppOrigin(req.headers.get('origin'));
    const { url } = await createOrgBundleCheckoutSession({
      orgId,
      tier,
      quantity: access.venueCount,
      customerEmail: user.email ?? null,
      billingSupabase,
      origin,
    });
    return NextResponse.json({ url });
```

Add the import near the top and drop the now-unused `getStripe`/`getPriceIdForBundle` imports if no longer referenced:

```ts
import { createOrgBundleCheckoutSession } from '@/utils/bundle-checkout';
```

(Keep `getPriceIdForBundle`/`getStripe` imports only if still used elsewhere in the file — after this refactor they are not, so remove them from the import to avoid unused-import lint.)

- [ ] **Step 5: Update the existing org-checkout guard** — the refactor moves `getPriceIdForBundle` and the `bundle_tier` literal OUT of the route into the helper, so two assertions in `test/bundle.test.mjs` (the `"org-checkout gates access, sizes the bundle, and tags subscription metadata"` test) now fail. Edit that test: replace

```js
  assert.match(CHECKOUT_SRC, /getPriceIdForBundle/);
  ...
  assert.match(CHECKOUT_SRC, /bundle_tier/);
```

with

```js
  assert.match(CHECKOUT_SRC, /createOrgBundleCheckoutSession/);
```

(Keep the `checkOrgBillingAccess`, `bundleTierForCount`, `isTrustedBrowserRequest`, and `quantity` assertions — the route still references those. The `bundle_tier` metadata is now guarded in `test/org-bundle-ui.test.mjs` Task 1 against the helper.)

- [ ] **Step 6: Run tests + typecheck**

Run: `node --test test/org-bundle-ui.test.mjs` → PASS.
Run: `node --test test/bundle.test.mjs` → PASS (with the updated guard).
Run: `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/utils/bundle-checkout.ts apps/web/src/app/api/stripe/org-checkout/route.ts test/org-bundle-ui.test.mjs test/bundle.test.mjs
git commit -m "refactor(billing): extract createOrgBundleCheckoutSession; route delegates (Phase 4-3)"
```

---

## Task 2: org-portal route

**Files:**
- Create: `apps/web/src/app/api/stripe/org-portal/route.ts`
- Test: `test/org-bundle-ui.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `test/org-bundle-ui.test.mjs`:

```js
test("org-portal route gates by org access and opens the billing portal for the org customer", () => {
  const src = read("apps/web/src/app/api/stripe/org-portal/route.ts");
  assert.match(src, /isTrustedBrowserRequest/);
  assert.match(src, /checkOrgBillingAccess/);
  assert.match(src, /org_subscriptions/);
  assert.match(src, /stripe_customer_id/);
  assert.match(src, /billingPortal\.sessions\.create/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/org-bundle-ui.test.mjs`
Expected: FAIL — route file missing.

- [ ] **Step 3: Write the route** (`apps/web/src/app/api/stripe/org-portal/route.ts`)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { STRIPE_BILLING_CONFIG_ERROR, getStripe, isStripeConfigurationError } from '@/utils/stripe';
import { checkOrgBillingAccess } from '@/utils/billing-access';
import { getSafeAppOrigin, isTrustedBrowserRequest } from '@/utils/security';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (!isTrustedBrowserRequest(req.headers)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { orgId } = (await req.json()) as { orgId: string };
    const access = await checkOrgBillingAccess(supabase, user, orgId);
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

    const billingSupabase = access.isPlatformAdmin ? createServiceClient() : supabase;
    const { data: sub } = await billingSupabase
      .from('org_subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .maybeSingle() as any;

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active bundle found' }, { status: 404 });
    }

    const origin = getSafeAppOrigin(req.headers.get('origin'));
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/orgs/${orgId}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/org-portal]', err);
    return NextResponse.json(
      { error: isStripeConfigurationError(err) ? STRIPE_BILLING_CONFIG_ERROR : 'Could not open billing. Please try again.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `node --test test/org-bundle-ui.test.mjs` → PASS.
Run: `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/stripe/org-portal/route.ts test/org-bundle-ui.test.mjs
git commit -m "feat(billing): org-level Stripe billing portal route (Phase 4-3)"
```

---

## Task 3: OrgBundlePanel component

**Files:**
- Create: `apps/web/src/components/OrgBundlePanel.tsx`

- [ ] **Step 1: Write the component** (no unit test — repo has no React tests; verified by typecheck + the org-page wiring in Task 4)

```tsx
'use client';

import { useState, useTransition } from 'react';
import { bundleTierForCount, rateForBundleTier, type BundleTier } from '@/utils/bundle';

const TIER_LABEL: Record<BundleTier, string> = {
  bundle_2_4: 'Bundle · 2–4 venues',
  bundle_5_plus: 'Bundle · 5+ venues',
};

export type OrgBundleSummary = {
  tier: BundleTier;
  status: string;
  venueCount: number;
  monthlyRatePerVenueCents: number;
  currentPeriodEnd: string | null;
};

type Props = {
  orgId: string;
  venueCount: number;
  bundle: OrgBundleSummary | null;
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function OrgBundlePanel({ orgId, venueCount, bundle }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function post(url: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Something went wrong'); return; }
        window.location.href = data.url;
      } catch {
        setError('Network error — please try again');
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-heading-sm font-semibold text-foreground">Org bundle</h2>
        {bundle && (
          <button
            onClick={() => post('/api/stripe/org-portal')}
            disabled={pending}
            className="h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors disabled:opacity-50"
          >
            Manage billing
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-error bg-red-50 px-4 py-3 mb-5">
          <p className="text-body-sm text-error">{error}</p>
        </div>
      )}

      {bundle ? (
        <div>
          <p className="text-body-sm text-muted">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-amber-50 text-amber-700">
              {TIER_LABEL[bundle.tier]}
            </span>{' '}
            <span className="ml-2">{bundle.status}</span>
          </p>
          <p className="mt-3 text-display-sm font-bold text-foreground">
            {dollars(bundle.monthlyRatePerVenueCents * bundle.venueCount)}
            <span className="text-body-sm text-muted font-normal">/mo</span>
          </p>
          <p className="text-body-sm text-muted">
            {bundle.venueCount} venues × {dollars(bundle.monthlyRatePerVenueCents)}/venue
            {bundle.currentPeriodEnd ? ` · renews ${new Date(bundle.currentPeriodEnd).toLocaleDateString()}` : ''}
          </p>
          <p className="mt-4 text-caption text-muted">
            Cancelling your bundle returns all venues to Listed.
          </p>
        </div>
      ) : (
        <StartBundle orgId={orgId} venueCount={venueCount} pending={pending} onStart={() => post('/api/stripe/org-checkout')} />
      )}
    </div>
  );
}

function StartBundle({ venueCount, pending, onStart }: { orgId: string; venueCount: number; pending: boolean; onStart: () => void }) {
  const tier = bundleTierForCount(venueCount);
  if (!tier) {
    return <p className="text-body-sm text-muted">A bundle needs at least 2 venues. You have {venueCount}.</p>;
  }
  const monthly = rateForBundleTier(tier) * venueCount;
  return (
    <div>
      <p className="text-body-sm text-muted mb-3">
        {venueCount} venues → {dollars(rateForBundleTier(tier))}/venue ={' '}
        <span className="font-semibold text-foreground">{dollars(monthly)}/mo</span> ({TIER_LABEL[tier]})
      </p>
      <button
        onClick={onStart}
        disabled={pending}
        className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
      >
        Start bundle
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/OrgBundlePanel.tsx
git commit -m "feat(billing): OrgBundlePanel — owner start/manage UI (Phase 4-3)"
```

---

## Task 4: Wire the panel into the org page

**Files:**
- Modify: `apps/web/src/app/orgs/[orgId]/page.tsx`

- [ ] **Step 1: Load the bundle + render the panel** — in `OrgPage`, after `venues` is fetched and `role`/`isOwner`/`userIsAdmin` are computed, add the data load:

```ts
  const venueCount = (venues ?? []).length;
  const canManageBilling = isOwner || role === 'manager' || userIsAdmin;
  const { data: orgBundleRow } = canManageBilling
    ? await (supabase as any)
        .from('org_subscriptions')
        .select('bundle_tier, status, venue_count, monthly_rate_per_venue_cents, current_period_end')
        .eq('org_id', orgId)
        .maybeSingle()
    : { data: null };

  const orgBundle = orgBundleRow
    ? {
        tier: orgBundleRow.bundle_tier as 'bundle_2_4' | 'bundle_5_plus',
        status: orgBundleRow.status as string,
        venueCount: orgBundleRow.venue_count as number,
        monthlyRatePerVenueCents: orgBundleRow.monthly_rate_per_venue_cents as number,
        currentPeriodEnd: (orgBundleRow.current_period_end as string | null) ?? null,
      }
    : null;
```

- [ ] **Step 2: Import and render** — add the import at the top of the file:

```ts
import { OrgBundlePanel } from '@/components/OrgBundlePanel';
```

And place the panel in the JSX inside `<main>` (e.g., just below the page header, before the venues section):

```tsx
        {canManageBilling && (
          <OrgBundlePanel orgId={orgId} venueCount={venueCount} bundle={orgBundle} />
        )}
```

- [ ] **Step 3: Typecheck + tests**

Run: `cd apps/web && npx tsc --noEmit` → 0 errors.
Run: `node --test test/org-bundle-ui.test.mjs` → PASS (still green).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/orgs/[orgId]/page.tsx
git commit -m "feat(billing): show OrgBundlePanel on the org page for owners/managers/admin (Phase 4-3)"
```

---

## Task 5: Admin bundle actions

**Files:**
- Create: `apps/web/src/actions/admin-bundle-actions.ts`
- Test: `test/org-bundle-ui.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `test/org-bundle-ui.test.mjs`:

```js
test("admin bundle actions: grant pilot, generate link, cancel", () => {
  const src = read("apps/web/src/actions/admin-bundle-actions.ts");
  assert.match(src, /export async function adminGrantPilotBundle/);
  assert.match(src, /export async function adminCreateBundleCheckoutLink/);
  assert.match(src, /export async function adminCancelOrgBundle/);
  assert.match(src, /assertAdmin/);
  assert.match(src, /'pilot'/);
  assert.match(src, /createOrgBundleCheckoutSession/);
  assert.match(src, /subscriptions\.cancel/);
  // pilot comps (no stripe sub) cancel by setting status directly
  assert.match(src, /'canceled'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/org-bundle-ui.test.mjs`
Expected: FAIL — `admin-bundle-actions.ts` missing.

- [ ] **Step 3: Write the actions** (`apps/web/src/actions/admin-bundle-actions.ts`)

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { getStripe } from '@/utils/stripe';
import { getSafeAppOrigin } from '@/utils/security';
import { bundleTierForCount, rateForBundleTier } from '@/utils/bundle';
import { createOrgBundleCheckoutSession } from '@/utils/bundle-checkout';

async function countOrgVenues(supabase: ReturnType<typeof getAdminClient>, orgId: string): Promise<number> {
  const { count } = await supabase.from('venues').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
  return count ?? 0;
}

/** Comp a no-charge pilot bundle: writes org_subscriptions directly, no Stripe. */
export async function adminGrantPilotBundle(formData: FormData) {
  await assertAdmin();
  const orgId = formData.get('org_id') as string | null;
  if (!orgId) throw new Error('org_id is required');
  const supabase = getAdminClient();

  const venueCount = await countOrgVenues(supabase, orgId);
  const tier = bundleTierForCount(venueCount);
  if (!tier) throw new Error('A bundle needs at least 2 venues');

  const { error } = await (supabase as any).from('org_subscriptions').upsert(
    {
      org_id: orgId,
      bundle_tier: tier,
      monthly_rate_per_venue_cents: rateForBundleTier(tier),
      venue_count: venueCount,
      status: 'pilot',
    },
    { onConflict: 'org_id' },
  );
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}

/** Create a checkout session for the org; returns the URL for staff to share. */
export async function adminCreateBundleCheckoutLink(formData: FormData): Promise<string> {
  await assertAdmin();
  const orgId = formData.get('org_id') as string | null;
  if (!orgId) throw new Error('org_id is required');
  const supabase = getAdminClient();

  const venueCount = await countOrgVenues(supabase, orgId);
  const tier = bundleTierForCount(venueCount);
  if (!tier) throw new Error('A bundle needs at least 2 venues');

  const { url } = await createOrgBundleCheckoutSession({
    orgId,
    tier,
    quantity: venueCount,
    customerEmail: null,
    billingSupabase: supabase,
    origin: getSafeAppOrigin(null),
  });
  return url ?? '';
}

/** Cancel a bundle on behalf of an org. Paid → Stripe cancel (webhook updates DB);
 *  comped pilot (no Stripe sub) → set status canceled directly. */
export async function adminCancelOrgBundle(formData: FormData) {
  await assertAdmin();
  const orgId = formData.get('org_id') as string | null;
  if (!orgId) throw new Error('org_id is required');
  const supabase = getAdminClient();

  const { data: row } = await (supabase as any)
    .from('org_subscriptions')
    .select('stripe_subscription_id')
    .eq('org_id', orgId)
    .maybeSingle();

  if (row?.stripe_subscription_id) {
    await getStripe().subscriptions.cancel(row.stripe_subscription_id);
    // webhook (customer.subscription.deleted) flips org_subscriptions to canceled
  } else {
    const { error } = await (supabase as any)
      .from('org_subscriptions')
      .update({ status: 'canceled' })
      .eq('org_id', orgId);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/admin/plans');
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `node --test test/org-bundle-ui.test.mjs` → PASS.
Run: `cd apps/web && npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/actions/admin-bundle-actions.ts test/org-bundle-ui.test.mjs
git commit -m "feat(billing): admin bundle actions — pilot comp, link, cancel (Phase 4-3)"
```

---

## Task 6: Admin Org Bundles table

**Files:**
- Modify: `apps/web/src/app/admin/plans/page.tsx`

- [ ] **Step 1: Load org bundles** — in the admin plans page (service-role server component), add a query alongside the existing ones:

```ts
  const { data: orgBundleRows } = await (supabase as any)
    .from('org_subscriptions')
    .select('org_id, bundle_tier, status, venue_count, monthly_rate_per_venue_cents, current_period_end, organizations(name)')
    .order('created_at', { ascending: false });
  const orgBundles = ((orgBundleRows ?? []) as any[]).map((r) => ({
    org_id: r.org_id as string,
    org_name: (r.organizations?.name as string) ?? r.org_id,
    bundle_tier: r.bundle_tier as string,
    status: r.status as string,
    venue_count: r.venue_count as number,
    monthly_total: ((r.monthly_rate_per_venue_cents as number) * (r.venue_count as number)) / 100,
    current_period_end: (r.current_period_end as string | null) ?? null,
  }));
```

- [ ] **Step 2: Render the table + actions** — add the import and a section in the page JSX (reuse the existing `thCls`/`tdCls` classes already defined in the file):

```tsx
import { adminGrantPilotBundle, adminCreateBundleCheckoutLink, adminCancelOrgBundle } from '@/actions/admin-bundle-actions';
```

```tsx
        <section className="mb-10">
          <h2 className="text-heading-sm font-semibold text-foreground mb-3">Org bundles</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface">
                <tr>
                  <th className={thCls}>Org</th><th className={thCls}>Tier</th><th className={thCls}>Status</th>
                  <th className={thCls}>Venues</th><th className={thCls}>$/mo</th><th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {orgBundles.map((b) => (
                  <tr key={b.org_id}>
                    <td className={tdCls}>{b.org_name}</td>
                    <td className={tdCls}>{b.bundle_tier}</td>
                    <td className={tdCls}>{b.status}</td>
                    <td className={tdCls}>{b.venue_count}</td>
                    <td className={tdCls}>${b.monthly_total}</td>
                    <td className={tdCls}>
                      <form action={adminCancelOrgBundle} className="inline">
                        <input type="hidden" name="org_id" value={b.org_id} />
                        <button className="text-error hover:underline text-body-sm">Cancel</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={adminGrantPilotBundle} className="mt-3 flex gap-2 items-center">
            <input name="org_id" placeholder="org_id to comp a pilot bundle" className="h-9 px-3 rounded-md border border-border bg-surface text-body-sm w-96" />
            <button className="h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium">Grant pilot</button>
          </form>
        </section>
```

Note: `adminCancelOrgBundle` runs the all-listed effect immediately; the destructive-confirm dialog is deferred to a follow-up if the team wants a typed confirmation (the page already uses plain form submits for other admin actions). `adminCreateBundleCheckoutLink` returns a URL — wire a small client button that calls it and shows the link in a later iteration if needed; for this task the form actions cover comp + cancel, and the link generator is exercised by the guard test + manual call.

- [ ] **Step 3: Typecheck + tests**

Run: `cd apps/web && npx tsc --noEmit` → 0 errors.
Run: `node --test test/*.test.mjs` → all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/plans/page.tsx
git commit -m "feat(billing): admin Org Bundles table (view + comp + cancel) (Phase 4-3)"
```

---

## Manual verification (test mode, after Task 4 and after Task 6)

> Dev server with test env (`STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_PRODUCT_BUNDLE_2_4/_5_PLUS`, `STRIPE_WEBHOOK_SECRET` from `stripe listen`, `APP_ALLOWED_ORIGINS=http://localhost:3000`) + `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

- **Owner panel (Tasks 1–4):** as an org owner with ≥2 venues, open `/orgs/{orgId}` → panel shows the price preview → "Start bundle" → Stripe Checkout (card `4242`) → after redirect the panel shows the active bundle + "Manage billing" opens the portal.
- **Admin (Tasks 5–6):** `/admin/plans` → Org Bundles table lists it → "Grant pilot" for an org with ≥2 venues writes a `pilot` row and elevates its venues → "Cancel" reverts to Listed.

## Final verification gates

- `npm test` → green (existing + `test/org-bundle-ui.test.mjs`).
- `cd apps/web && npx tsc --noEmit` → 0 errors.
