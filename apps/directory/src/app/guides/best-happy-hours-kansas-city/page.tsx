import type { Metadata } from "next";
import { breadcrumbJsonLd } from "@/lib/structuredData";

const BASE = "https://happitime.biz";
const CANONICAL = `${BASE}/guides/best-happy-hours-kansas-city/`;

export const metadata: Metadata = {
  title: "The 15 Best Happy Hours in Kansas City (2026)",
  description:
    "Our curated list of the 15 best happy hours in Kansas City for 2026 — from Westport dive bars to Power & Light rooftops. Neighborhoods, tips, and deals inside.",
  keywords: [
    "best happy hours Kansas City",
    "KC happy hour 2026",
    "top happy hours KC",
    "Kansas City drink specials",
    "best bars Kansas City",
    "Westport happy hour",
    "Power and Light happy hour",
    "Crossroads happy hour",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "The 15 Best Happy Hours in Kansas City (2026) | HappiTime",
    description:
      "Our curated list of the best happy hours across every KC neighborhood.",
    url: CANONICAL,
    type: "article",
    siteName: "HappiTime",
  },
  twitter: {
    card: "summary_large_image",
    title: "The 15 Best Happy Hours in Kansas City (2026)",
    description:
      "Neighborhood-by-neighborhood picks for the best happy hours in KC.",
  },
};

const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "When do happy hours typically start in Kansas City?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most Kansas City happy hours start between 3 PM and 5 PM on weekdays. Some spots — especially in Westport and the Crossroads — kick off as early as 2 PM. Weekend happy hours are less common but growing, particularly in the Power & Light District.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best neighborhood for happy hour in Kansas City?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Westport is widely considered the best neighborhood for happy hour thanks to its dense concentration of bars, competitive pricing, and walkability. Power & Light is great for a more polished downtown experience, while the Crossroads Arts District offers the most creative cocktail menus.",
      },
    },
    {
      "@type": "Question",
      name: "Are there late-night happy hours in Kansas City?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — several KC bars run reverse or late-night happy hours starting at 9 or 10 PM. Westport and Power & Light have the most late-night options, with drink specials often running until close on weeknights.",
      },
    },
    {
      "@type": "Question",
      name: "Does Kansas City allow happy hour drink specials?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Missouri law allows bars and restaurants to offer discounted drink pricing during designated happy hour periods, making KC one of the best cities in the Midwest for happy hour deals.",
      },
    },
  ],
};

export default function BestHappyHoursKC() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
    { name: "Best Happy Hours in KC", url: CANONICAL },
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
        <span className="text-foreground font-medium">Best Happy Hours in KC</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        The 15 Best Happy Hours in{" "}
        <span className="text-brand">Kansas City</span> (2026)
      </h1>
      <p className="text-muted text-lg mb-10 max-w-2xl">
        Kansas City takes happy hour seriously. Missouri&apos;s bar-friendly laws, a
        booming restaurant scene, and fiercely competitive neighborhoods mean
        you can find world-class deals every single day of the week. Here are
        our picks for 2026.
      </p>

      {/* Westport */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Westport — The Happy Hour Capital
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          <a href="/kc/westport/" className="text-brand font-medium hover:underline">Westport</a>{" "}
          has the highest density of happy hour spots in the metro. Within a
          few walkable blocks you can find $3 wells, half-price craft drafts,
          and two-for-one cocktails. The neighborhood rewards bar-hoppers:
          start with a patio beer, move to a speakeasy-style lounge, and
          finish at a late-night dive — all without needing a ride.
        </p>
        <p className="text-muted leading-relaxed">
          Look for weekday specials starting as early as 2 PM. Several spots
          also run reverse happy hours after 9 PM, making Westport ideal for
          both the after-work crowd and night owls.
        </p>
      </section>

      {/* Power & Light */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Power & Light — Downtown Energy
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          The{" "}
          <a href="/kc/power-and-light/" className="text-brand font-medium hover:underline">
            Power &amp; Light District
          </a>{" "}
          is where after-work KC converges. Two pedestrian-friendly blocks of
          restaurants and bars deliver everything from rooftop margaritas to
          bourbon flights at steep discounts. Happy hours here lean upscale —
          think craft cocktails for $6 instead of $14 — but the savings are
          real.
        </p>
        <p className="text-muted leading-relaxed">
          Peak time is 4 PM to 6 PM on Thursday and Friday. Arrive early for
          patio seating during warm-weather months.
        </p>
      </section>

      {/* Crossroads */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Crossroads Arts District — Creative Cocktails
        </h2>
        <p className="text-muted leading-relaxed">
          The{" "}
          <a href="/kc/crossroads/" className="text-brand font-medium hover:underline">Crossroads</a>{" "}
          is KC&apos;s most inventive cocktail neighborhood. Happy hour menus
          here feature seasonal ingredients, house-made syrups, and bartender
          originals at approachable prices. If you care about craft over
          volume, this is your district. First Fridays add an extra layer of
          energy with gallery openings and street vendors.
        </p>
      </section>

      {/* Plaza */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Country Club Plaza — Upscale Sips
        </h2>
        <p className="text-muted leading-relaxed">
          The{" "}
          <a href="/kc/plaza/" className="text-brand font-medium hover:underline">Plaza</a>{" "}
          delivers a more polished happy hour experience — think wine lists,
          charcuterie boards, and classic cocktails with a view. It&apos;s the go-to
          for date-night happy hours and client dinners that need to impress
          without breaking the budget.
        </p>
      </section>

      {/* 18th & Vine */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          18th &amp; Vine — History with a Pour
        </h2>
        <p className="text-muted leading-relaxed">
          KC&apos;s historic{" "}
          <a href="/kc/18th-and-vine/" className="text-brand font-medium hover:underline">
            18th &amp; Vine Jazz District
          </a>{" "}
          pairs soul food and live music with no-frills drink specials. Happy
          hours here feel like stepping into Kansas City&apos;s cultural heartbeat —
          affordable, authentic, and always accompanied by a great soundtrack.
        </p>
      </section>

      {/* River Market */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          River Market — Waterfront Patios
        </h2>
        <p className="text-muted leading-relaxed">
          The{" "}
          <a href="/kc/river-market/" className="text-brand font-medium hover:underline">River Market</a>{" "}
          district offers brewery taprooms, waterfront patios, and a relaxed
          vibe that pairs perfectly with a lazy afternoon pour. Saturday
          farmers-market energy spills into nearby bars, making it a weekend
          standout.
        </p>
      </section>

      {/* Tips section */}
      <section className="mb-10 rounded-2xl bg-brand-subtle p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground mb-3">
          Tips for Getting the Most Out of KC Happy Hours
        </h2>
        <ul className="list-disc list-inside text-muted space-y-2 text-sm leading-relaxed">
          <li>Most happy hours run Monday through Friday, 3 PM - 6 PM. Arrive by 4 PM for the best seating.</li>
          <li>Westport and the Crossroads have the most walkable bar clusters — plan a crawl instead of committing to one spot.</li>
          <li>Check HappiTime for daily menus — many venues rotate specials by day of the week.</li>
          <li>Late-night reverse happy hours (9 PM+) are a hidden gem, especially midweek.</li>
          <li>Food deals often offer the best value — half-price appetizers can stretch a $20 budget surprisingly far.</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">When do happy hours typically start in Kansas City?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Most start between 3 PM and 5 PM on weekdays. Some Westport and Crossroads spots kick off as early as 2 PM. Weekend happy hours are less common but growing, especially in Power &amp; Light.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">What is the best neighborhood for happy hour?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Westport tops the list for variety and walkability. Power &amp; Light is best for a downtown vibe, and the Crossroads wins for creative cocktails.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Are there late-night happy hours in KC?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Yes — several bars run reverse happy hours starting at 9 or 10 PM, particularly in Westport and Power &amp; Light.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Does Missouri allow happy hour drink specials?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Yes. Missouri law permits discounted drink pricing during happy hour, making KC one of the best happy hour cities in the Midwest.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-brand-subtle p-8 sm:p-10 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Ready to find your next happy hour?
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          Browse live deals across every KC neighborhood or get the app for
          real-time reminders.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="/kc/"
            className="inline-block rounded-full border border-brand px-6 py-2.5 text-brand font-semibold text-sm hover:bg-brand hover:text-white transition-colors"
          >
            Browse KC Happy Hours
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
