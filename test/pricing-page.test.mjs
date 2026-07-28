import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const pricing = read("apps/directory/src/app/pricing/page.tsx");
const contact = read("apps/directory/src/app/contactus/page.tsx");
const globals = read("apps/directory/src/app/globals.css");
const layout = read("apps/directory/src/app/layout.tsx");

// /pricing is the port of the "Venue Pricing" design. There is no public
// self-serve checkout -- /api/stripe/checkout requires an authenticated owner
// with an existing venue+org -- so the paid CTAs hand off to the contact flow
// carrying the plan. These two files have to agree or the lead loses context.

test("paid plan CTAs carry the plan through to the contact flow", () => {
  for (const plan of ["featured", "verified"]) {
    assert.match(
      pricing,
      new RegExp(`/contactus\\?plan=${plan}`),
      `the ${plan} CTA must hand off to /contactus?plan=${plan}`
    );
  }
  // The design shipped with unresolved placeholders; they must not reach prod.
  assert.doesNotMatch(pricing, /STRIPE_PAYMENT_LINK/, "placeholder hrefs must be replaced");
});

test("the contact form prefills a subject for every plan /pricing links to", () => {
  const linked = [...pricing.matchAll(/\/contactus\?plan=([a-z]+)/g)].map((m) => m[1]);
  assert.ok(linked.length > 0, "expected /pricing to link at least one plan");

  for (const plan of new Set(linked)) {
    assert.match(
      contact,
      new RegExp(`^\\s*${plan}:`, "m"),
      `PLAN_SUBJECTS is missing "${plan}", so that CTA would land on a blank form`
    );
  }
});

test("useSearchParams in the contact form is wrapped in Suspense", () => {
  // Without a boundary the whole route silently opts into client rendering.
  assert.match(contact, /useSearchParams/);
  assert.match(contact, /<Suspense/);
});

test("the pricing page does not duplicate the site chrome", () => {
  // layout.tsx already renders SiteHeader/SiteFooter around every page; the
  // source design was standalone and carried its own nav + footer.
  assert.match(layout, /SiteHeader|SiteFooter/);
  assert.doesNotMatch(pricing, /<nav\b/, "site nav comes from the layout");
  assert.doesNotMatch(pricing, /<footer\b/, "site footer comes from the layout");
});

test("headings opt out of the Boska serif via an unlayered rule", () => {
  // A Tailwind font utility loses to the unlayered `h1,h2,h3` rule in
  // globals.css (unlayered styles beat any @layer), so the override must be
  // unlayered too -- not an @utility/@layer declaration.
  assert.match(pricing, /heading-sans/);
  assert.match(globals, /\.heading-sans\s*\{[^}]*--font-jakarta/);
  assert.doesNotMatch(
    globals,
    /@layer[^{]*\{[^}]*\.heading-sans/s,
    "heading-sans must stay unlayered or the serif wins"
  );
});
