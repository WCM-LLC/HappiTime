import type { Metadata } from "next";
import { PageTracker } from "@/components/PageTracker";

export const metadata: Metadata = {
  title: "Venue Pricing — Get Your Happy Hour Found on HappiTime",
  description:
    "List your Kansas City bar or restaurant on HappiTime. Free listings, Verified at $49/mo, Featured at $99/mo with 30 days free. Month-to-month, cancel anytime.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Venue Pricing — HappiTime",
    description:
      "Put your happy hour in front of Kansas City locals at the moment they're deciding where to go. Plans from free.",
    url: "https://happitime.biz/pricing",
  },
};

/* ── Page section toggles ────────────────────────────────────────────────
   These mirror the editable props on the source design (Venue Pricing.dc.html)
   so sections can be pulled without unpicking markup. */
const SHOW_PROMO_BAR = true;
const SHOW_ROI_PANEL = true;
const SHOW_BUNDLE_BAND = true;

/* Napkin-math inputs. EXTRA_REVENUE assumes two extra tables a month. */
const AVG_TAB = 85;
const FEATURED_PRICE = 99;
const EXTRA_REVENUE = AVG_TAB * 2;
const NET_MONTHLY = EXTRA_REVENUE - FEATURED_PRICE;

/* CTAs route into the venue console's checkout (/upgrade resolves the owner's
   venue and forwards to its subscription page). Unlike the retired Stripe
   Payment Links, console checkout carries venue_id/org_id metadata, so the
   webhook activates the plan automatically — no manual reconciliation.
   Featured's 30-day trial is applied by the checkout route
   (apps/web/src/app/api/stripe/checkout/route.ts). */
const FEATURED_CTA = "https://happitime-console.vercel.app/upgrade?plan=featured";
const VERIFIED_CTA = "https://happitime-console.vercel.app/upgrade?plan=verified";

const SHELL = "mx-auto max-w-5xl px-6";
/* The source design sets Plus Jakarta Sans on every heading. The site shell
   otherwise defaults h1-h3 to the Boska serif, so headings opt out explicitly
   via .heading-sans (see globals.css for why a utility class won't do it). */
const DISPLAY = "heading-sans font-extrabold tracking-[-0.02em] leading-[1.15]";

const PRICING_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "HappiTime Venue Listing",
  description:
    "Happy-hour listing plans for Kansas City bars and restaurants on HappiTime.",
  brand: { "@type": "Brand", name: "HappiTime" },
  offers: [
    { "@type": "Offer", name: "Listed", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Verified", price: "49", priceCurrency: "USD" },
    { "@type": "Offer", name: "Featured", price: "99", priceCurrency: "USD" },
  ].map((offer) => ({
    ...offer,
    availability: "https://schema.org/InStock",
    url: "https://happitime.biz/pricing",
  })),
};

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
      className="mt-[3px] size-[18px] shrink-0 text-success"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function Cross() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
      className="mt-[3px] size-[18px] shrink-0 text-border-strong"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function TrustIcon({ d, className = "size-4" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className={`${className} shrink-0 text-brand-dark`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const PIN_PATH =
  "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z";
const CHECK_CIRCLE_PATH = "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
const CLOCK_PATH = "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z";
const CARD_PATH =
  "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z";
const LOCK_PATH =
  "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z";

type Feature = { text: React.ReactNode; muted?: boolean };

function FeatureList({ items }: { items: Feature[] }) {
  return (
    <ul className="mb-7 flex-1 list-none">
      {items.map((item, i) => (
        <li
          key={i}
          className={`flex gap-2.5 py-[7px] text-[14.5px] ${item.muted ? "text-muted-light" : ""}`}
        >
          {item.muted ? <Cross /> : <Check />}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  return (
    <>
      {/* Completes the venue-side funnel. The fork's cta_click already records
          that someone chose the "pouring" door; this records whether they
          actually arrived, so a door that gets pressed but never lands is
          distinguishable from one that converts. */}
      <PageTracker pagePath="/pricing/" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_JSONLD) }}
      />

      {SHOW_PROMO_BAR && (
        <div className="bg-dark px-4 py-[9px] text-center text-[13.5px] font-medium text-dark-foreground">
          Launch offer:{" "}
          <b className="font-bold text-brand-light">Featured free for 30 days</b> — $0 today,
          nothing billed until day 31, cancel anytime
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="bg-[radial-gradient(1000px_420px_at_50%_-80px,var(--color-brand-subtle)_0%,transparent_70%)] pt-[76px] pb-10 text-center">
        <div className={SHELL}>
          <div className="mb-[22px] inline-flex items-center gap-2 rounded-full bg-brand-subtle px-4 py-[7px] text-[13px] font-bold uppercase tracking-[0.04em] text-brand-dark-alt">
            <span className="size-[7px] animate-pulse rounded-full bg-brand" />
            For KC bars &amp; restaurants
          </div>
          <h1 className={`${DISPLAY} mb-[18px] text-balance text-[clamp(2.4rem,5.5vw,3.6rem)]`}>
            Empty seats at 4 PM
            <br />
            are a <em className="not-italic text-brand-dark">findability</em> problem.
          </h1>
          <p className="mx-auto mb-[30px] max-w-[600px] text-pretty text-[19px] text-muted">
            HappiTime puts your happy hour in front of Kansas City locals at the exact moment
            they&rsquo;re deciding where to go tonight.
          </p>
          <a
            href="#pricing"
            className="inline-block rounded-full bg-dark px-[30px] py-3.5 text-[15px] font-bold text-white transition-all duration-normal ease-default hover:-translate-y-px hover:bg-black"
          >
            See plans — from free
          </a>
          <div className="mt-7 flex flex-wrap justify-center gap-x-[26px] gap-y-2.5 text-sm font-medium text-muted">
            <span className="flex items-center gap-2">
              <TrustIcon d={PIN_PATH} />
              180+ KC spots listed
            </span>
            <span className="flex items-center gap-2">
              <TrustIcon d={CHECK_CIRCLE_PATH} />
              Venue-confirmed hours &amp; deals
            </span>
            <span className="flex items-center gap-2">
              <TrustIcon d={CLOCK_PATH} />
              No contract — cancel anytime
            </span>
          </div>
        </div>
      </header>

      {/* ── Plans ────────────────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-20 pt-11 pb-[26px]">
        <div className={SHELL}>
          <div className="mx-auto grid max-w-[440px] grid-cols-1 items-stretch gap-[22px] md:max-w-none md:grid-cols-3">
            {/* Listed — free */}
            <div className="order-3 flex flex-col rounded-xl border border-border bg-surface px-[30px] pt-[34px] pb-[30px] shadow-md md:order-1">
              <div className="mb-1 text-xl font-extrabold">Listed</div>
              <p className="mb-5 min-h-[42px] text-sm text-muted">
                Your venue on the map, so locals can find the basics.
              </p>
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className="text-[44px] font-black leading-[1.1] tracking-[-0.03em]">$0</span>
                <span className="text-[15px] font-medium text-muted">/ month</span>
              </div>
              <div className="mb-2 min-h-5 text-[13px] text-muted">Free forever</div>
              <span aria-hidden="true" className="invisible mb-[18px] px-3 py-[5px] text-[12.5px]">
                .
              </span>
              <FeatureList
                items={[
                  { text: "Basic listing — name, address, neighborhood page" },
                  { text: "Appears in directory search" },
                  { text: "No badge, no menu preview", muted: true },
                  { text: "Ranks below paid listings", muted: true },
                ]}
              />
              <a
                href="/contactus?plan=listed"
                className="block w-full rounded-full border-[1.5px] border-border-strong px-[26px] py-3 text-center text-[15px] font-bold text-foreground transition-all duration-normal ease-default hover:border-foreground"
              >
                Claim your free listing
              </a>
              <p className="mt-3 text-center text-[12.5px] text-muted-light">No card required</p>
            </div>

            {/* Featured — highlighted */}
            <div className="relative order-1 flex flex-col rounded-xl border-2 border-brand bg-surface px-[30px] pt-[34px] pb-[30px] shadow-xl md:order-2 md:scale-[1.03]">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-[18px] py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-white shadow-md">
                Most visibility
              </div>
              <div className="mb-1 flex items-center gap-2 text-xl font-extrabold">
                Featured
                <span className="rounded-full bg-brand-subtle px-2.5 py-[3px] text-[11.5px] font-bold text-brand-dark-alt">
                  ★ Featured
                </span>
              </div>
              <p className="mb-5 min-h-[42px] text-sm text-muted">
                Top of the page when locals are picking tonight&rsquo;s spot.
              </p>
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className="text-[44px] font-black leading-[1.1] tracking-[-0.03em]">$99</span>
                <span className="text-[15px] font-medium text-muted">/ month</span>
              </div>
              <div className="mb-2 min-h-5 text-[13px] text-muted">
                ≈ $3.30/day — one seated table covers the month
              </div>
              <span className="mb-[18px] inline-flex items-center gap-1.5 self-start rounded-full bg-success-light px-3 py-[5px] text-[12.5px] font-bold text-success">
                ✦ First 30 days free — $0 today
              </span>
              <FeatureList
                items={[
                  {
                    text: (
                      <>
                        <b className="font-bold">Top placement</b> in search &amp; neighborhood pages
                      </>
                    ),
                  },
                  {
                    text: (
                      <>
                        <b className="font-bold">★ Featured badge</b> on your card
                      </>
                    ),
                  },
                  {
                    text: (
                      <>
                        <b className="font-bold">Happy-hour menu preview</b> right on your listing card
                      </>
                    ),
                  },
                  {
                    text: (
                      <>
                        <b className="font-bold">Visit attribution report</b> — see the traffic
                        HappiTime sends you, night by night
                      </>
                    ),
                  },
                  { text: "Everything in Verified" },
                ]}
              />
              <a
                href={FEATURED_CTA}
                className="block w-full rounded-full bg-brand px-[26px] py-3.5 text-center text-[15px] font-bold text-white shadow-md transition-all duration-normal ease-default hover:-translate-y-px hover:bg-brand-dark"
              >
                Start 30 days free
              </a>
              <p className="mt-3 text-center text-[12.5px] text-muted-light">
                $0 today · $99/mo starting day 31 · cancel anytime
              </p>
            </div>

            {/* Verified */}
            <div className="order-2 flex flex-col rounded-xl border border-border bg-surface px-[30px] pt-[34px] pb-[30px] shadow-md md:order-3">
              <div className="mb-1 flex items-center gap-2 text-xl font-extrabold">
                Verified
                <span className="rounded-full bg-success-light px-2.5 py-[3px] text-[11.5px] font-bold text-success">
                  Verified ✓
                </span>
              </div>
              <p className="mb-5 min-h-[42px] text-sm text-muted">
                Own your listing and rank above every free venue.
              </p>
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className="text-[44px] font-black leading-[1.1] tracking-[-0.03em]">$49</span>
                <span className="text-[15px] font-medium text-muted">/ month</span>
              </div>
              <div className="mb-2 min-h-5 text-[13px] text-muted">
                ≈ $1.63/day — less than one draft beer
              </div>
              <span aria-hidden="true" className="invisible mb-[18px] px-3 py-[5px] text-[12.5px]">
                .
              </span>
              <FeatureList
                items={[
                  {
                    text: (
                      <>
                        <b className="font-bold">Verified ✓ badge</b> — venue-confirmed trust mark
                      </>
                    ),
                  },
                  {
                    text: (
                      <>
                        <b className="font-bold">Edit anytime</b> — hours, deals, menus, photos from
                        your console
                      </>
                    ),
                  },
                  {
                    text: (
                      <>
                        <b className="font-bold">Ranks above</b> all free listings
                      </>
                    ),
                  },
                  {
                    text: (
                      <>
                        <b className="font-bold">Performance snapshot</b> — monthly views &amp;
                        clicks on your listing
                      </>
                    ),
                  },
                  { text: "No top placement, menu preview, or attribution", muted: true },
                ]}
              />
              <a
                href={VERIFIED_CTA}
                className="block w-full rounded-full bg-dark px-[26px] py-3.5 text-center text-[15px] font-bold text-white transition-all duration-normal ease-default hover:-translate-y-px hover:bg-black"
              >
                Get Verified
              </a>
              <p className="mt-3 text-center text-[12.5px] text-muted-light">
                No contract · cancel anytime
              </p>
            </div>
          </div>

          <div className="mt-[30px] flex flex-wrap justify-center gap-x-7 gap-y-2 text-[13.5px] font-medium text-muted">
            <span className="flex items-center gap-[7px]">
              <TrustIcon d={CHECK_CIRCLE_PATH} className="size-[15px]" />
              Month-to-month, no contract
            </span>
            <span className="flex items-center gap-[7px]">
              <TrustIcon d={CLOCK_PATH} className="size-[15px]" />
              Cancel anytime in two clicks
            </span>
            <span className="flex items-center gap-[7px]">
              <TrustIcon d={CARD_PATH} className="size-[15px]" />
              Secure checkout by Stripe
            </span>
          </div>

          {SHOW_ROI_PANEL && (
            <div className="mt-14 grid grid-cols-1 items-center gap-9 rounded-xl border border-border bg-cream px-10 py-[38px] md:grid-cols-[1.2fr_1fr]">
              <div>
                <h2 className={`${DISPLAY} mb-3 text-[26px]`}>Do the napkin math.</h2>
                <p className="text-pretty text-[15px] text-muted">
                  A happy-hour party of four runs $60–$120 in tabs. If being findable brings you{" "}
                  <b className="text-foreground">two extra tables a month</b>, the Featured plan has
                  already paid for itself — everything after that is margin on seats that were
                  sitting empty.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface px-[26px] py-6 shadow-md">
                <div className="flex justify-between border-b border-dashed border-border py-2 text-[14.5px]">
                  <span>Featured plan</span>
                  <span>−${FEATURED_PRICE} / mo</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-border py-2 text-[14.5px]">
                  <span>2 extra tables × ${AVG_TAB} avg tab</span>
                  <span className="font-bold text-success">+${EXTRA_REVENUE}</span>
                </div>
                <div className="flex justify-between pt-3 text-[14.5px] font-extrabold">
                  <span>Net</span>
                  <span className="text-success">+${NET_MONTHLY} / mo</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Attribution / data ───────────────────────────────────────── */}
      <section className="pt-[72px]">
        <div className={SHELL}>
          <div className="grid grid-cols-1 items-center gap-11 md:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-brand-dark-alt">
                Your numbers, not our word
              </p>
              <h2 className={`${DISPLAY} mb-3.5 text-[30px]`}>Stop guessing what marketing does.</h2>
              <p className="mb-3.5 text-pretty text-[15.5px] text-muted">
                Every paid plan comes with data. Verified venues get a monthly snapshot of how many
                locals saw and clicked their listing. Featured venues get the report owners actually
                argue about at the bar:{" "}
                <b className="text-foreground">which nights HappiTime put people on your stools</b>.
              </p>
              <p className="text-pretty text-[15.5px] text-muted">
                We track how locals find you and when they show up — you get the results, not the
                homework. The report arrives monthly, readable in 60 seconds.
              </p>
            </div>

            <div className="relative rounded-lg border border-border bg-surface px-6 py-[22px] shadow-xl">
              <span className="absolute -top-[11px] right-[18px] rounded-full bg-dark px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-dark-foreground">
                Sample report
              </span>
              <div className="mb-3.5 flex items-center justify-between border-b border-border pb-3">
                <span className="text-[14.5px] font-extrabold">Your Venue — Monthly Report</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-light">
                  HappiTime
                </span>
              </div>
              {[
                { label: "Listing views", width: "88%", value: "1,284" },
                { label: "Profile clicks", width: "56%", value: "312" },
                { label: "Directions & calls", width: "34%", value: "97" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-[7px] text-[13.5px]"
                >
                  <span className="text-muted">{row.label}</span>
                  <span className="mx-3.5 h-2 flex-1 overflow-hidden rounded bg-brand-subtle">
                    <i className="block h-full rounded bg-brand" style={{ width: row.width }} />
                  </span>
                  <span className="font-extrabold">{row.value}</span>
                </div>
              ))}
              {[
                { label: "HappiTime-attributed visits", width: "72%", value: "248" },
                { label: "Your best HappiTime night", width: "64%", value: "Thu" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-[7px] text-[13.5px]"
                >
                  <span className="font-bold text-brand-dark-alt">{row.label}</span>
                  <span className="mx-3.5 h-2 flex-1 overflow-hidden rounded bg-brand-subtle">
                    <i className="block h-full rounded bg-brand-dark" style={{ width: row.width }} />
                  </span>
                  <span className="select-none font-extrabold text-brand-dark-alt blur-[7px]">
                    {row.value}
                  </span>
                </div>
              ))}
              <div className="mt-3 flex items-center gap-2 border-t border-dashed border-border pt-3 text-[12.5px] text-muted">
                <TrustIcon d={LOCK_PATH} className="size-3.5" />
                Attribution rows unlock with Featured
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comparison ───────────────────────────────────────────────── */}
      <section id="compare" className="scroll-mt-20 pt-16 pb-2">
        <div className={SHELL}>
          <h2 className={`${DISPLAY} mb-2 text-center text-[30px]`}>Compare plans</h2>
          <p className="mb-[34px] text-center text-[15.5px] text-muted">
            Every plan gets you on the map. Paid plans control how — and how high — you show up.
          </p>
          <div className="overflow-x-auto rounded-lg shadow-md">
            <table className="w-full min-w-[640px] border-collapse bg-surface text-[14.5px]">
              <caption className="sr-only">
                HappiTime venue plan comparison: Listed, Verified, and Featured
              </caption>
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-[18px] [&>th]:py-[13px] [&>th]:text-[13px] [&>th]:uppercase [&>th]:tracking-[0.03em]">
                  <th scope="col" className="text-left font-medium text-muted">
                    What you get
                  </th>
                  <th scope="col" className="text-center text-muted">
                    Listed
                    <br />
                    $0
                  </th>
                  <th scope="col" className="text-center text-muted">
                    Verified
                    <br />
                    $49/mo
                  </th>
                  <th scope="col" className="bg-brand-subtle text-center text-brand-dark-alt">
                    Featured
                    <br />
                    $99/mo
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Directory + neighborhood page listing", "✓", "✓", "✓"],
                  ["Edit hours, deals, menus & photos anytime", "—", "✓", "✓"],
                  ["Trust badge on your card", "—", "Verified ✓", "★ Featured"],
                  ["Ranks above free listings", "—", "✓", "✓"],
                  ["Monthly performance snapshot (views & clicks)", "—", "✓", "✓"],
                  ["Top placement in search & neighborhoods", "—", "—", "✓"],
                  ["Happy-hour menu preview on card", "—", "—", "✓"],
                  ["Visit attribution report — traffic HappiTime sent you", "—", "—", "✓"],
                ].map(([label, listed, verified, featured], i, rows) => {
                  const edge = i === rows.length - 1 ? "" : "border-b border-border";
                  const cell = (v: string) =>
                    v === "—" ? "text-muted-light" : "font-bold text-success";
                  return (
                    <tr key={label}>
                      <th
                        scope="row"
                        className={`${edge} px-[18px] py-[13px] text-left font-medium`}
                      >
                        {label}
                      </th>
                      <td className={`${edge} px-[18px] py-[13px] text-center ${cell(listed)}`}>
                        {listed}
                      </td>
                      <td className={`${edge} px-[18px] py-[13px] text-center ${cell(verified)}`}>
                        {verified}
                      </td>
                      <td
                        className={`${edge} bg-brand-subtle/40 px-[18px] py-[13px] text-center ${cell(featured)}`}
                      >
                        {featured}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Founding partners ────────────────────────────────────────── */}
      <section className="pt-16 text-center">
        <div className={SHELL}>
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.08em] text-muted">
            In good company
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {["Vine Street Brewing Co.", "Tacos Valentina"].map((name) => (
              <div
                key={name}
                className="rounded-full border border-border bg-surface px-[22px] py-2.5 text-[15px] font-bold shadow-md"
              >
                <span className="mr-1.5 text-brand-dark">★</span>
                {name}
              </div>
            ))}
          </div>
          <p className="mt-3.5 text-sm text-muted">
            Founding partners — alongside 180+ Kansas City spots already listed on HappiTime.
          </p>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="pt-[72px]">
        <div className={SHELL}>
          <h2 className={`${DISPLAY} mb-[38px] text-center text-[30px]`}>Live in three steps</h2>
          <div className="mx-auto grid max-w-[440px] grid-cols-1 gap-[22px] sm:max-w-none sm:grid-cols-3">
            {[
              {
                title: "Claim your venue",
                body: "Tell us which venue is yours and we email your venue console login — typically within one business day. Already have console access? Skip straight to checkout.",
              },
              {
                title: "Pick a plan",
                body: (
                  <>
                    Sign in and check out securely with Stripe. Featured starts with{" "}
                    <b className="text-foreground">30 days free</b> — $0 charged today.
                  </>
                ),
              },
              {
                title: "You take the wheel",
                body: "Your badge and placement go live the moment checkout completes. Update specials, hours, menus, and photos anytime.",
              },
            ].map((step, i) => (
              <div
                key={step.title}
                className="rounded-lg border border-border bg-surface p-[26px] shadow-md"
              >
                <div className="mb-3.5 flex size-[34px] items-center justify-center rounded-full bg-brand-subtle text-[15px] font-black text-brand-dark-alt">
                  {i + 1}
                </div>
                <h3 className="mb-1.5 font-sans text-[17px] font-extrabold tracking-[-0.01em]">
                  {step.title}
                </h3>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Multi-venue bundles ──────────────────────────────────────── */}
      {SHOW_BUNDLE_BAND && (
        <section className="mt-16">
          <div className={SHELL}>
            <div className="flex flex-wrap items-center justify-between gap-7 rounded-xl bg-dark px-11 py-10 text-dark-foreground">
              <div>
                <h2 className={`${DISPLAY} mb-2 text-[26px] text-white`}>Run more than one spot?</h2>
                <p className="max-w-[420px] text-[15px] text-dark-muted">
                  Bundle pricing gives every location Featured-level placement at a lower per-venue
                  rate.
                </p>
              </div>
              <div className="flex flex-wrap gap-3.5">
                {[
                  { tier: "2–4 venues", price: "$79" },
                  { tier: "5+ venues", price: "$59" },
                ].map((b) => (
                  <div
                    key={b.tier}
                    className="min-w-[150px] rounded-lg border border-dark-muted/30 bg-dark-surface px-[22px] py-4 text-center"
                  >
                    <div className="mb-0.5 text-[13px] text-dark-muted">{b.tier}</div>
                    <div className="text-2xl font-black">
                      {b.price}{" "}
                      <span className="text-[13px] font-medium text-dark-muted">/venue/mo</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex w-full flex-wrap items-center gap-3.5">
                <a
                  href="mailto:hello@happitime.biz?subject=HappiTime%20bundle%20pricing"
                  className="inline-block rounded-full bg-brand px-[26px] py-3 text-[14.5px] font-bold text-white transition-all duration-normal ease-default hover:bg-brand-dark"
                >
                  Talk bundles — hello@happitime.biz
                </a>
                <span className="text-[13px] text-dark-muted">
                  We&rsquo;ll set up all your locations for you.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-20 pt-[72px]">
        <div className="mx-auto max-w-[var(--width-narrow)] px-6">
          <h2 className={`${DISPLAY} mb-[34px] text-center text-[30px]`}>
            Questions venue owners ask
          </h2>
          {[
            {
              q: "Is there a contract or minimum term?",
              a: "No. Every plan is month-to-month. Cancel anytime from your billing portal and you keep your paid features until the end of the billing period. Your free listing never goes away.",
              open: true,
            },
            {
              q: "What does “venue-confirmed” mean?",
              a: "Unlike AI-scraped aggregators, HappiTime only shows happy-hour data that's been confirmed with the venue. That's why locals trust the listings — and why a Verified badge means something to them.",
            },
            {
              q: "What happens right after I pay?",
              a: "Your payment is tied to your venue automatically, so your badge and ranking upgrade go live the moment checkout completes. Stripe emails you a receipt, and you manage everything from the venue console from then on.",
            },
            {
              q: "How do I update my specials?",
              a: "Verified and Featured venues get access to the HappiTime venue console — change hours, deals, menus, and photos yourself, anytime, from any browser. No emails, no waiting.",
            },
            {
              q: "What data do I actually get?",
              a: "Verified venues get a monthly performance snapshot: how many locals viewed your listing, clicked through, and asked for directions. Featured venues also get the attribution report — the visits and nights HappiTime drove to your door. How we measure it is our recipe; the numbers are yours, in plain English, every month.",
            },
            {
              q: "How does the free 30 days of Featured work?",
              a: "Start Featured and Stripe collects your card but charges $0 today. Your first $99 charge lands on day 31. Cancel anytime during the 30 days and you pay nothing at all. You'll get an email reminder before the trial ends.",
            },
          ].map((item) => (
            <details
              key={item.q}
              open={item.open}
              className="group mb-3 overflow-hidden rounded-lg border border-border bg-surface"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3.5 px-[22px] py-[18px] text-[15.5px] font-bold [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="text-xl font-medium leading-none text-brand-dark transition-transform duration-normal group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="px-[22px] pb-[18px] text-[14.5px] text-muted">{item.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      <section className="mt-[76px] bg-brand-subtle py-16 text-center">
        <div className={SHELL}>
          <h2 className={`${DISPLAY} mb-3 text-balance text-[clamp(1.8rem,4vw,2.4rem)]`}>
            Tonight, someone&rsquo;s choosing a happy hour.
          </h2>
          <p className="mx-auto mb-7 max-w-[520px] text-pretty text-base text-muted">
            Make sure it&rsquo;s yours they find. Try Featured{" "}
            <b className="text-foreground">free for 30 days</b> — $0 today, cancel anytime.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <a
              href={FEATURED_CTA}
              className="inline-block rounded-full bg-dark px-[30px] py-3.5 text-[15px] font-bold text-white transition-all duration-normal ease-default hover:-translate-y-px hover:bg-black"
            >
              Try Featured free for 30 days
            </a>
            <a
              href={VERIFIED_CTA}
              className="inline-block rounded-full border-[1.5px] border-border-strong px-[30px] py-3.5 text-[15px] font-bold text-foreground transition-all duration-normal ease-default hover:border-foreground"
            >
              Get Verified — $49/mo
            </a>
          </div>
          <p className="mt-4 text-[13px] text-muted">
            No contract · cancel anytime · secure checkout by Stripe
          </p>
        </div>
      </section>
    </>
  );
}
