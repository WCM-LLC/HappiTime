import type { Metadata } from "next";
import { breadcrumbJsonLd } from "@/lib/structuredData";

const BASE = "https://happitime.biz";
const CANONICAL = `${BASE}/guides/power-and-light-happy-hour-guide/`;

export const metadata: Metadata = {
  title: "Power & Light District Happy Hour Guide",
  description:
    "Your guide to happy hour in the Power & Light District — rooftop bars, craft cocktails, and downtown KC's best after-work deals. Updated for 2026.",
  keywords: [
    "Power and Light happy hour",
    "Power & Light District bars",
    "downtown Kansas City happy hour",
    "P&L drink specials",
    "Power and Light restaurants",
    "KC downtown bars",
    "rooftop happy hour Kansas City",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "Power & Light District Happy Hour Guide | HappiTime",
    description:
      "Rooftop bars, craft cocktails, and downtown KC's best after-work deals.",
    url: CANONICAL,
    type: "article",
    siteName: "HappiTime",
  },
  twitter: {
    card: "summary_large_image",
    title: "Power & Light District Happy Hour Guide",
    description:
      "Everything you need for happy hour in P&L, downtown Kansas City.",
  },
};

const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What time is happy hour in Power & Light District?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most Power & Light venues run happy hour from 4 PM to 7 PM on weekdays. Some spots extend to 7:30 PM on Thursdays and Fridays. A few restaurants also offer weekend brunch drink specials.",
      },
    },
    {
      "@type": "Question",
      name: "Is Power & Light good for after-work happy hour?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Power & Light is one of the best after-work happy hour spots in KC. Its central downtown location makes it easy to walk from nearby offices, and the pedestrian-friendly layout means you can hop between venues without crossing busy streets.",
      },
    },
    {
      "@type": "Question",
      name: "Are there rooftop happy hours in Power & Light?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — several Power & Light venues feature rooftop or elevated patios with happy hour pricing. These fill up fast during warm months, so arriving by 4:30 PM is recommended for the best seats.",
      },
    },
    {
      "@type": "Question",
      name: "How does Power & Light compare to Westport for happy hour?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Power & Light tends to be slightly more upscale and polished, with higher baseline prices but bigger discounts during happy hour. Westport has more dive bars and a wider range of price points. P&L is better for a corporate or date-night vibe; Westport is better for casual crawls.",
      },
    },
  ],
};

export default function PowerAndLightGuide() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
    { name: "Power & Light Happy Hour Guide", url: CANONICAL },
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
        <span className="text-foreground font-medium">Power &amp; Light</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Power &amp; Light District{" "}
        <span className="text-brand">Happy Hour Guide</span>
      </h1>
      <p className="text-muted text-lg mb-10 max-w-2xl">
        The{" "}
        <a href="/kc/power-and-light/" className="text-brand font-medium hover:underline">
          Power &amp; Light District
        </a>{" "}
        is downtown Kansas City&apos;s premier entertainment block — two
        pedestrian streets lined with restaurants, bars, and rooftop patios
        that come alive during happy hour.
      </p>

      {/* The vibe */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          The After-Work Destination
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          Power &amp; Light sits steps from KC&apos;s central business district,
          making it the natural landing spot when the workday ends. By 4:30 PM
          on a Thursday, patios are filling up and bartenders are shaking
          discounted cocktails. The energy is polished but not stuffy — you
          will find suits loosening ties next to groups in Chiefs jerseys.
        </p>
        <p className="text-muted leading-relaxed">
          The district&apos;s layout is its secret weapon. Because the two main
          blocks are pedestrian-only, you can wander between venues with a
          drink in hand (within the district boundaries), making it one of
          the easiest happy hour crawls in the metro.
        </p>
      </section>

      {/* What to expect */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Drinks, Food &amp; Pricing
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          Expect happy hour cocktails in the <strong>$5-$8 range</strong> (down
          from $12-$16 regular). Draft beers typically drop to $4-$5, and wine
          by the glass runs $5-$7. Several restaurants pair drink deals with
          discounted appetizer menus — think half-price flatbreads, $6 sliders,
          and shareable dips.
        </p>
        <p className="text-muted leading-relaxed">
          The best value play is to combine a drink special with a food deal.
          A craft cocktail and a half-price app at P&amp;L can come in under
          $15 — a fraction of the regular dinner check.
        </p>
      </section>

      {/* Best times */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Best Days &amp; Times
        </h2>
        <ul className="list-disc list-inside text-muted space-y-2 text-sm leading-relaxed">
          <li><strong>Monday-Wednesday:</strong> Quieter, easier to snag rooftop seating. Some venues extend happy hour to 7 PM.</li>
          <li><strong>Thursday:</strong> The most popular after-work night. Arrive by 4 PM for a seat.</li>
          <li><strong>Friday:</strong> High energy, fast transitions from happy hour to nightlife. Deals often end at 6 PM sharp.</li>
          <li><strong>Weekends:</strong> Limited happy hour offerings, but brunch drink specials at several restaurants fill the gap.</li>
        </ul>
      </section>

      {/* Nearby neighborhoods */}
      <section className="mb-10 rounded-2xl bg-brand-subtle p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground mb-3">
          Extend Your Evening
        </h2>
        <p className="text-muted text-sm leading-relaxed mb-3">
          Power &amp; Light connects easily to neighboring districts on foot.
          After happy hour, consider walking to:
        </p>
        <ul className="list-disc list-inside text-muted space-y-1 text-sm">
          <li><a href="/kc/crossroads/" className="text-brand hover:underline">Crossroads Arts District</a> — 10 min walk south for creative cocktails</li>
          <li><a href="/kc/river-market/" className="text-brand hover:underline">River Market</a> — 10 min walk north for brewery taprooms</li>
          <li><a href="/kc/downtown/" className="text-brand hover:underline">Downtown KC</a> — surrounding blocks with steakhouses and lounges</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">What time is happy hour in P&amp;L?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Most venues run 4 PM to 7 PM on weekdays. Some extend to 7:30 PM Thursday and Friday.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Is Power &amp; Light good for after-work drinks?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">It is one of the best in KC — walkable from downtown offices with a wide range of venues and price points.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Are there rooftop happy hours?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Yes, several venues have rooftop or elevated patios with happy hour pricing. Arrive early in warm months for the best seats.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">How does P&amp;L compare to Westport?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">P&amp;L is more upscale with bigger discounts on premium drinks. <a href="/kc/westport/" className="text-brand hover:underline">Westport</a> has more variety and lower baseline prices — better for casual crawls.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-brand-subtle p-8 sm:p-10 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          See today&apos;s Power &amp; Light deals
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          Browse live happy hour menus and times for every P&amp;L venue.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="/kc/power-and-light/"
            className="inline-block rounded-full border border-brand px-6 py-2.5 text-brand font-semibold text-sm hover:bg-brand hover:text-white transition-colors"
          >
            Power &amp; Light Happy Hours
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
