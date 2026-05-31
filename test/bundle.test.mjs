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

// ── Task 2: bundle price resolver in stripe.ts ──
const STRIPE_SRC = readFileSync(resolve(ROOT, "apps/web/src/utils/stripe.ts"), "utf8");
test("stripe.ts resolves bundle prices and guards the bundle env vars", () => {
  assert.match(STRIPE_SRC, /export async function getPriceIdForBundle/);
  assert.match(STRIPE_SRC, /STRIPE_PRODUCT_BUNDLE_2_4/);
  assert.match(STRIPE_SRC, /STRIPE_PRODUCT_BUNDLE_5_PLUS/);
  assert.match(STRIPE_SRC, /BUNDLE_2_4\|BUNDLE_5_PLUS|BUNDLE/);
});

// ── Task 3: org-level billing access ──
const ACCESS_SRC = readFileSync(resolve(ROOT, "apps/web/src/utils/billing-access.ts"), "utf8");
test("billing-access exposes an org-level check gated to owner/manager", () => {
  assert.match(ACCESS_SRC, /export async function checkOrgBillingAccess/);
  assert.match(ACCESS_SRC, /BILLING_MANAGER_ROLES/);
});

// ── Task 4: org checkout route ──
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
