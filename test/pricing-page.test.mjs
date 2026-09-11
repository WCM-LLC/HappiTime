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

// /pricing is the port of the "Venue Pricing" design. Paid CTAs route into
// the venue console's /upgrade flow, whose checkout carries venue_id/org_id
// metadata so the Stripe webhook activates plans automatically. The old
// Stripe Payment Links are retired -- they carried no venue context and every
// sale through them required manual reconciliation.

test("paid plan CTAs route to the venue console upgrade flow", () => {
  const links = [
    ...pricing.matchAll(/https:\/\/happitime-console\.vercel\.app\/upgrade\?plan=(featured|verified)/g),
  ].map((m) => m[1]);
  assert.ok(
    links.includes("featured") && links.includes("verified"),
    "expected console upgrade links for both paid plans"
  );

  // Payment Links forced manual reconciliation; they must not come back.
  assert.doesNotMatch(pricing, /buy\.stripe\.com/, "Stripe Payment Links are retired");
  // Paid plans go to console checkout, not the contact form (the free tier may).
  assert.doesNotMatch(pricing, /\/contactus\?plan=(featured|verified)/, "paid CTAs should be console checkout");
});

test("the free tier hands off to the contact form, not a paid checkout", () => {
  // Regression guard: sending the $0 tier to a Payment Link would ask a free
  // signup for a card. /claim is retired, so the handoff is the contact form
  // with the plan prefilled.
  assert.match(pricing, /href="\/contactus\?plan=listed"/);
});

test("/claim is fully retired — no live links, and the 301 stays", () => {
  // The page was deleted (it duplicated /pricing with a sales-call funnel).
  // Any surviving href would be a 404; the URL was indexed so the redirect
  // in next.config.ts must remain.
  const venueDetail = read("apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx");
  const sitemap = read("apps/directory/src/app/sitemap.ts");
  const nextConfig = read("apps/directory/next.config.ts");
  for (const [name, src] of [["pricing", pricing], ["venue detail", venueDetail], ["sitemap", sitemap]]) {
    assert.doesNotMatch(src, /["'`]\/claim\/?["'`]/, `${name} still references /claim`);
  }
  assert.match(nextConfig, /source: "\/claim"/, "the /claim 301 redirect was removed");
});

test("the contact form can still prefill a subject for each paid plan", () => {
  // /pricing no longer links here, but the plan-specific subjects remain valid
  // for hand-sent links and bundle conversations.
  for (const plan of ["featured", "verified", "listed"]) {
    assert.match(
      contact,
      new RegExp(`^\\s*${plan}:`, "m"),
      `PLAN_SUBJECTS is missing "${plan}"`
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
