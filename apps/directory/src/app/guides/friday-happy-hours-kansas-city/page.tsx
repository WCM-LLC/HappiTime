import type { Metadata } from "next";
import { breadcrumbJsonLd } from "@/lib/structuredData";

const BASE = "https://happitime.biz";
const CANONICAL = `${BASE}/guides/friday-happy-hours-kansas-city/`;

export const metadata: Metadata = {
  title: "Friday Happy Hours in Kansas City — Where to Go This Weekend",
  description:
    "The best Friday happy hours in Kansas City — early starts, extended deals, and the neighborhoods that do Fridays best. Plan your weekend kickoff with HappiTime.",
  keywords: [
    "Friday happy hour Kansas City",
    "KC Friday happy hour",
    "Kansas City weekend happy hour",
    "Friday drink specials KC",
    "best Friday bars Kansas City",
    "Friday after work KC",
    "weekend happy hour Kansas City",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "Friday Happy Hours in Kansas City | HappiTime",
    description:
      "Where to kick off your weekend — the best Friday happy hours across KC.",
    url: CANONICAL,
    type: "article",
    siteName: "HappiTime",
  },
  twitter: {
    card: "summary_large_image",
    title: "Friday Happy Hours in Kansas City — Where to Go This Weekend",
    description:
      "Plan your Friday with the best happy hour deals across Kansas City.",
  },
};

const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What time should I arrive for Friday happy hour in Kansas City?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Aim for 3:30 PM to 4:00 PM. Friday is the busiest happy hour day in KC, and popular spots in Westport and Power & Light fill up fast. Arriving early guarantees you a seat and catches the full deal window before specials end at 6 PM.",
      },
    },
    {
      "@type": "Question",
      name: "Do Kansas City bars extend happy hour on Fridays?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Some do. A handful of bars in Westport and the Crossroads extend Friday specials to 7 PM, and a few Power & Light venues push to 7:30 PM. However, the majority stick to the standard cutoff of 6 PM, so check HappiTime for venue-specific times.",
      },
    },
    {
      "@type": "Question",
      name: "Where is the best neighborhood for Friday happy hour in KC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Power & Light draws the biggest Friday crowd thanks to its downtown location and after-work foot traffic. Westport is best for a more relaxed, bar-crawl-friendly vibe. The Crossroads is ideal if you want to combine happy hour with First Friday art events (once a month).",
      },
    },
    {
      "@type": "Question",
      name: "Are there Friday happy hours that transition into nightlife?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Absolutely. Both Westport and Power & Light are designed for a seamless happy-hour-to-nightlife transition. Many bars end happy hour at 6 PM but keep the energy going with DJ sets, live music, or weekend drink menus that start immediately after.",
      },
    },
  ],
};

export default function FridayHappyHours() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
    { name: "Friday Happy Hours in KC", url: CANONICAL },
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
        <span className="text-foreground font-medium">Friday Happy Hours</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Friday Happy Hours in{" "}
        <span className="text-brand">Kansas City</span>
      </h1>
      <p className="text-muted text-lg mb-10 max-w-2xl">
        Friday is the biggest happy hour day in Kansas City. The after-work
        exodus hits bars across every neighborhood, and the best spots fill
        up fast. Here is how to make the most of your Friday in KC.
      </p>

      {/* Why Friday is different */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Why Friday Happy Hour Hits Different
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          The energy on a Friday is not the same as a Tuesday. Crowds are
          bigger, patios are louder, and the line between happy hour and
          nightlife blurs. In KC, Friday happy hour is less of a quick drink
          and more of an event — the official start to the weekend.
        </p>
        <p className="text-muted leading-relaxed">
          That also means more competition for seating and shorter deal
          windows. Most venues stick to a hard cutoff at 6 PM on Fridays,
          so timing matters more than any other day of the week.
        </p>
      </section>

      {/* Neighborhood breakdown */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Best Neighborhoods for Friday
        </h2>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          Power &amp; Light — The After-Work Surge
        </h3>
        <p className="text-muted leading-relaxed mb-3">
          <a href="/kc/power-and-light/" className="text-brand font-medium hover:underline">Power &amp; Light</a>{" "}
          draws the biggest Friday crowd in KC. Office workers pour out of
          downtown towers into the pedestrian district by 4 PM. Rooftop
          patios are the first to fill. If you want a seat outdoors, plan to
          arrive by 3:30 PM.
        </p>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          Westport — Crawl-Ready
        </h3>
        <p className="text-muted leading-relaxed mb-3">
          <a href="/kc/westport/" className="text-brand font-medium hover:underline">Westport</a>{" "}
          is the best Friday option if you want to move between bars. The
          neighborhood&apos;s walkability means you can start with cheap
          drafts on a patio, shift to a cocktail spot, and end up at a live
          music venue — all within a few blocks.
        </p>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          Crossroads — First Friday Bonus
        </h3>
        <p className="text-muted leading-relaxed mb-3">
          The{" "}
          <a href="/kc/crossroads/" className="text-brand font-medium hover:underline">Crossroads</a>{" "}
          shines on the first Friday of every month, when gallery openings
          and street vendors create a festival atmosphere. Bars and
          restaurants capitalize with extended specials and special menus.
          Even on non-First-Friday weeks, the neighborhood&apos;s cocktail
          bars are a strong pick.
        </p>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          River Market &amp; Midtown — Relaxed Alternatives
        </h3>
        <p className="text-muted leading-relaxed">
          If the Friday crowds at P&amp;L and Westport are not your speed,
          the{" "}
          <a href="/kc/river-market/" className="text-brand font-medium hover:underline">River Market</a>{" "}
          and{" "}
          <a href="/kc/midtown/" className="text-brand font-medium hover:underline">Midtown</a>{" "}
          offer a mellower Friday experience — brewery taprooms, neighborhood
          bars, and patio seating without the wait.
        </p>
      </section>

      {/* Timing strategy */}
      <section className="mb-10 rounded-2xl bg-brand-subtle p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground mb-3">
          Friday Timing Playbook
        </h2>
        <ul className="list-disc list-inside text-muted space-y-2 text-sm leading-relaxed">
          <li><strong>3:00-3:30 PM:</strong> Arrive early to claim patio seating and catch the full deal window.</li>
          <li><strong>4:00-5:00 PM:</strong> Peak happy hour — bars are full but deals are at their best.</li>
          <li><strong>5:30-6:00 PM:</strong> Last call on most specials. Order your final round before cutoff.</li>
          <li><strong>6:00 PM+:</strong> Happy hour ends at most spots, but the energy carries into the evening. Some venues switch to weekend drink menus or live music.</li>
          <li><strong>Pro tip:</strong> Check <a href="/kc/" className="text-brand hover:underline">HappiTime</a> before you leave — some venues have extended Friday hours that the crowd does not know about.</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">What time should I arrive for Friday happy hour?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Aim for 3:30-4:00 PM. Popular spots fill fast, and most deals end at 6 PM sharp.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Do any KC bars extend happy hour on Fridays?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Some bars in Westport and the Crossroads push to 7 PM, and a few P&amp;L venues go to 7:30 PM. Check HappiTime for specifics.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Where is the best neighborhood for Friday happy hour?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Power &amp; Light for the biggest crowd, <a href="/kc/westport/" className="text-brand hover:underline">Westport</a> for crawl-friendly vibes, and the Crossroads for creative cocktails (especially on First Fridays).</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Can I transition from happy hour into nightlife?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Absolutely. Both Westport and P&amp;L transition seamlessly — many bars end specials at 6 PM but keep the energy going with DJs and live music.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-brand-subtle p-8 sm:p-10 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Plan your Friday happy hour
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          See which KC bars are running Friday specials right now.
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
