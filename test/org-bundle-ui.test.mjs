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

test("org-portal route gates by org access and opens the billing portal for the org customer", () => {
  const src = read("apps/web/src/app/api/stripe/org-portal/route.ts");
  assert.match(src, /isTrustedBrowserRequest/);
  assert.match(src, /checkOrgBillingAccess/);
  assert.match(src, /org_subscriptions/);
  assert.match(src, /stripe_customer_id/);
  assert.match(src, /billingPortal\.sessions\.create/);
});

test("admin bundle actions: grant pilot, generate link, cancel", () => {
  const src = read("apps/web/src/actions/admin-bundle-actions.ts");
  assert.match(src, /export async function adminGrantPilotBundle/);
  assert.match(src, /export async function adminCreateBundleCheckoutLink/);
  assert.match(src, /export async function adminCancelOrgBundle/);
  assert.match(src, /assertAdmin/);
  assert.match(src, /'pilot'/);
  assert.match(src, /createOrgBundleCheckoutSession/);
  assert.match(src, /subscriptions\.cancel/);
  assert.match(src, /'canceled'/);
});
