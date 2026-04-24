import type { Metadata } from "next";
import { breadcrumbJsonLd } from "@/lib/structuredData";

const BASE = "https://happitime.biz";
const CANONICAL = `${BASE}/guides/westport-happy-hour-guide/`;

export const metadata: Metadata = {
  title: "Westport Happy Hour Guide — Best Bars & Deals",
  description:
    "The complete guide to happy hour in Westport, Kansas City. Best bars, cheapest drinks, walkable crawl routes, and daily deal breakdowns — updated for 2026.",
  keywords: [
    "Westport happy hour",
    "Westport Kansas City bars",
    "Westport drink specials",
    "Westport bar crawl",
    "happy hour Westport KC",
    "best bars Westport",
    "cheap drinks Westport Kansas City",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "Westport Happy Hour Guide — Best Bars & Deals | HappiTime",
    description:
      "Best bars, cheapest drinks, and daily deals in Westport, Kansas City.",
    url: CANONICAL,
    type: "article",
    siteName: "HappiTime",
  },
  twitter: {
    card: "summary_large_image",
    title: "Westport Happy Hour Guide — Best Bars & Deals",
    description:
      "Your complete guide to happy hour in Westport, Kansas City.",
  },
};

const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What time does happy hour start in Westport?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most Westport happy hours start between 3 PM and 5 PM on weekdays. A few bars open specials as early as 2 PM, and several run reverse happy hours after 9 PM.",
      },
    },
    {
      "@type": "Question",
      name: "Is Westport walkable for a happy hour bar crawl?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Absolutely. Westport is one of the most walkable entertainment districts in Kansas City. You can hit 5-6 bars within a few blocks along Westport Road and Pennsylvania Avenue without needing a car or rideshare.",
      },
    },
    {
      "@type": "Question",
      name: "Are there food specials during Westport happy hours?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — many Westport bars offer half-price appetizers, discounted tacos, and happy hour food menus alongside drink deals. Some of the best food values in the neighborhood come during the 3-6 PM happy hour window.",
      },
    },
  ],
};

export default function WestportGuide() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
    { name: "Westport Happy Hour Guide", url: CANONICAL },
  ]);

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }}
      />

      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <a href="/" className="hover:text-foreground transition-colors">HappiTime</a>
        <span className="text-muted-light">/</span>
        <a href="/guides/" className="hover:text-foreground transition-colors">Guides</a>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">Westport</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Westport Happy Hour Guide —{" "}
        <span className="text-brand">Best Bars &amp; Deals</span>
      </h1>
      <p className="text-muted text-lg mb-10 max-w-2xl">
        <a href="/kc/westport/" className="text-brand font-medium hover:underline">Westport</a>{" "}
        is Kansas City&apos;s original entertainment district and arguably its
        best happy hour destination. A dense strip of bars, restaurants, and
        lounges means competitive pricing and an easy walk from one deal to
        the next.
      </p>

      {/* Why Westport */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Why Westport Wins at Happy Hour
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          Three things make Westport stand out: walkability, variety, and
          value. Within a quarter-mile stretch of Westport Road you can
          find dive bars pouring $3 wells, gastropubs with half-price
          appetizer menus, and cocktail lounges running $6 signature drinks.
          No other KC neighborhood packs that much range into so few blocks.
        </p>
        <p className="text-muted leading-relaxed">
          The competition between venues keeps prices honest. When the bar
          across the street is advertising $4 craft pints, your neighbor
          can&apos;t charge $9. That race to the bottom is a win for anyone
          with a thirst and a budget.
        </p>
      </section>

      {/* When to go */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          When to Go
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          The classic Westport happy hour window is <strong>3 PM to 6 PM,
          Monday through Friday</strong>. Tuesdays and Wednesdays tend to be
          the least crowded — perfect for grabbing a patio seat without a
          wait. Thursdays pick up fast as the weekend crowd arrives early.
        </p>
        <p className="text-muted leading-relaxed">
          Don&apos;t overlook reverse happy hours. Several Westport bars bring
          specials back from 9 PM to close on weeknights, giving you a
          second shot at discounted drinks without the after-work rush.
        </p>
      </section>

      {/* What to expect */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          What to Expect: Drinks &amp; Food
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          Drink specials typically include $3-$4 domestic drafts, $5-$6
          craft beers, and $5-$7 cocktails. Several spots offer half-price
          wine by the glass. On the food side, look for discounted
          appetizers, $2-$3 tacos, and shareable plates in the $5-$8 range.
        </p>
        <p className="text-muted leading-relaxed">
          The best strategy is to graze: grab drinks at one spot, split an
          appetizer at the next, and finish with a nightcap somewhere new.
          Westport rewards the crawl.
        </p>
      </section>

      {/* Bar crawl route */}
      <section className="mb-10 rounded-2xl bg-brand-subtle p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground mb-3">
          Sample Westport Happy Hour Crawl
        </h2>
        <ol className="list-decimal list-inside text-muted space-y-2 text-sm leading-relaxed">
          <li><strong>Start at 3 PM</strong> — Grab a patio seat and a cheap draft at one of the dive bars on Westport Road.</li>
          <li><strong>4 PM</strong> — Walk east to a gastropub for half-price appetizers and a craft beer.</li>
          <li><strong>5 PM</strong> — Head to a cocktail lounge on Pennsylvania for discounted signature drinks.</li>
          <li><strong>6 PM+</strong> — Wind down at a neighborhood favorite with live music and a relaxed vibe.</li>
        </ol>
      </section>

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">What time does happy hour start in Westport?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Most bars start between 3 PM and 5 PM on weekdays. A handful open specials at 2 PM, and reverse happy hours kick in after 9 PM.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Is Westport walkable for a bar crawl?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Yes — it is one of the most walkable entertainment districts in KC. You can hit 5-6 bars within a few blocks without needing a car.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Are there food specials during happy hour?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Absolutely. Many spots offer half-price appetizers, discounted tacos, and dedicated happy hour food menus from 3-6 PM.</p>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-foreground mb-3">Related Guides</h2>
        <div className="flex flex-wrap gap-2">
          <a href="/guides/best-happy-hours-kansas-city/" className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:text-brand hover:border-brand transition-colors">Best Happy Hours in KC</a>
          <a href="/guides/best-happy-hour-food-kansas-city/" className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:text-brand hover:border-brand transition-colors">Best Happy Hour Food</a>
          <a href="/guides/friday-happy-hours-kansas-city/" className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:text-brand hover:border-brand transition-colors">Friday Happy Hours</a>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-brand-subtle p-8 sm:p-10 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          See today&apos;s Westport happy hours
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          Browse live deals, menus, and times for every Westport venue on HappiTime.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="/kc/westport/"
            className="inline-block rounded-full border border-brand px-6 py-2.5 text-brand font-semibold text-sm hover:bg-brand hover:text-white transition-colors"
          >
            Westport Happy Hours
          </a>
          <a
            href="/app/"
            className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            Get the App
          </a>
        </div>
      </section>
    </article>
  );
}
