import type { Metadata } from "next";
import { breadcrumbJsonLd } from "@/lib/structuredData";

const BASE = "https://happitime.biz";
const CANONICAL = `${BASE}/guides/best-happy-hour-food-kansas-city/`;

export const metadata: Metadata = {
  title: "Best Happy Hour Food Deals in Kansas City",
  description:
    "The best happy hour food deals in Kansas City — half-price appetizers, dollar tacos, discounted plates, and more across Westport, Power & Light, the Crossroads, and beyond.",
  keywords: [
    "happy hour food Kansas City",
    "best happy hour appetizers KC",
    "cheap eats Kansas City happy hour",
    "half price appetizers KC",
    "happy hour food deals",
    "Kansas City food specials",
    "dollar tacos Kansas City",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "Best Happy Hour Food Deals in Kansas City | HappiTime",
    description:
      "Half-price apps, dollar tacos, and discounted plates across every KC neighborhood.",
    url: CANONICAL,
    type: "article",
    siteName: "HappiTime",
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Happy Hour Food Deals in Kansas City",
    description:
      "Our guide to the best happy hour food deals across Kansas City.",
  },
};

const faqData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Which Kansas City neighborhood has the best happy hour food deals?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Westport and the Crossroads Arts District offer the widest variety of happy hour food specials, from half-price appetizers to discounted tacos and shareable plates. The Plaza has more upscale options like discounted charcuterie and oyster deals.",
      },
    },
    {
      "@type": "Question",
      name: "Can you get a full meal during happy hour in Kansas City?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — by combining two or three discounted appetizers or small plates, you can easily build a full meal for $12-$18 per person during happy hour. Many KC restaurants design their happy hour food menus for exactly this kind of grazing.",
      },
    },
    {
      "@type": "Question",
      name: "Are there happy hour food deals on weekends in KC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Weekend happy hour food deals are less common than weekday ones, but a growing number of KC restaurants — particularly in Power & Light and on the Plaza — offer Saturday brunch specials and Sunday food discounts.",
      },
    },
  ],
};

export default function BestHappyHourFood() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
    { name: "Best Happy Hour Food", url: CANONICAL },
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
        <span className="text-foreground font-medium">Best Happy Hour Food</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Best Happy Hour Food Deals in{" "}
        <span className="text-brand">Kansas City</span>
      </h1>
      <p className="text-muted text-lg mb-10 max-w-2xl">
        Kansas City is a food city first — and that extends to happy hour.
        Half-price appetizers, dollar tacos, discounted BBQ sliders, and
        chef-driven small plates are all on the table if you know where to
        look.
      </p>

      {/* Why food matters */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Why Happy Hour Food Is the Real Deal
        </h2>
        <p className="text-muted leading-relaxed mb-3">
          Drink specials get the headlines, but food deals deliver the best
          value. A $14 appetizer at half price is $7 saved — often more than
          the discount on a single cocktail. Stack two or three discounted
          plates and you have a full dinner for under $20 per person.
        </p>
        <p className="text-muted leading-relaxed">
          KC restaurants know this, which is why many design dedicated happy
          hour food menus — not just discounted versions of the regular menu,
          but purpose-built shareable plates meant to pair with drinks and
          encourage you to stay longer.
        </p>
      </section>

      {/* By neighborhood */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Best Neighborhoods for Happy Hour Food
        </h2>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          Westport — Casual &amp; Cheap
        </h3>
        <p className="text-muted leading-relaxed mb-3">
          <a href="/kc/westport/" className="text-brand font-medium hover:underline">Westport</a>{" "}
          bars lean into shareable, no-fuss food: loaded nachos, wings,
          sliders, and tacos in the $3-$6 range during happy hour. The
          neighborhood&apos;s bar density means you can graze across multiple
          spots on a single walk.
        </p>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          Crossroads — Chef-Driven Small Plates
        </h3>
        <p className="text-muted leading-relaxed mb-3">
          The{" "}
          <a href="/kc/crossroads/" className="text-brand font-medium hover:underline">Crossroads</a>{" "}
          is where KC&apos;s creative food scene meets happy hour pricing.
          Expect seasonal small plates, house-made charcuterie, and
          inventive snacks you won&apos;t find on standard bar menus — often at
          40-50% off during the 3-6 PM window.
        </p>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          Power &amp; Light — Upscale Bites
        </h3>
        <p className="text-muted leading-relaxed mb-3">
          <a href="/kc/power-and-light/" className="text-brand font-medium hover:underline">Power &amp; Light</a>{" "}
          restaurants offer polished happy hour food — think flatbreads,
          bruschetta flights, and sushi rolls at $6-$9. The savings are
          significant when regular appetizer prices run $14-$18.
        </p>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          Plaza — Wine &amp; Charcuterie
        </h3>
        <p className="text-muted leading-relaxed mb-3">
          The{" "}
          <a href="/kc/plaza/" className="text-brand font-medium hover:underline">Plaza</a>{" "}
          caters to a more upscale crowd with discounted wine pairings,
          cheese boards, and oyster deals. It is the go-to for a
          date-night happy hour where food is the main event.
        </p>

        <h3 className="text-lg font-semibold text-foreground mt-5 mb-2">
          18th &amp; Vine — Soul Food Specials
        </h3>
        <p className="text-muted leading-relaxed">
          <a href="/kc/18th-and-vine/" className="text-brand font-medium hover:underline">18th &amp; Vine</a>{" "}
          offers some of the most authentic food in the city during happy
          hour — think discounted fried catfish, collard greens, and
          cornbread alongside affordable pours.
        </p>
      </section>

      {/* Strategy */}
      <section className="mb-10 rounded-2xl bg-brand-subtle p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground mb-3">
          How to Build a Happy Hour Dinner
        </h2>
        <ol className="list-decimal list-inside text-muted space-y-2 text-sm leading-relaxed">
          <li>Pick a neighborhood with at least 3-4 happy hour options within walking distance.</li>
          <li>Start with a drink and one appetizer at your first stop. Do not over-commit.</li>
          <li>Move to a second venue for another round and a different plate — variety is the point.</li>
          <li>Budget $18-$25 per person for drinks and food across two to three stops.</li>
          <li>Use <a href="/kc/" className="text-brand hover:underline">HappiTime</a> to check which venues have food specials today before you leave.</li>
        </ol>
      </section>

      {/* FAQ */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">Which neighborhood has the best happy hour food?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Westport and the Crossroads offer the widest variety. The Plaza is best for upscale bites. 18th &amp; Vine stands out for soul food specials.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Can you get a full meal during happy hour?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Absolutely. Two or three discounted appetizers easily make a full meal for $12-$18 per person.</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Are there weekend food deals?</h3>
            <p className="text-muted text-sm leading-relaxed mt-1">Weekend happy hour food deals are growing, especially Saturday brunch specials in Power &amp; Light and Sunday discounts on the Plaza.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-brand-subtle p-8 sm:p-10 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Hungry? Browse today&apos;s deals.
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          See which KC restaurants are running food specials right now.
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
