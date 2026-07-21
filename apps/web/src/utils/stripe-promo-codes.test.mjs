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
