import type { Metadata } from "next";
import { breadcrumbJsonLd } from "@/lib/structuredData";

const BASE = "https://happitime.biz";

export const metadata: Metadata = {
  title:
    "Kansas City Happy Hour Guides — Tips, Best-of Lists & Neighborhood Spotlights | HappiTime",
  description:
    "Expert guides to Kansas City happy hours — best-of lists, neighborhood deep-dives, food deal roundups, and day-by-day picks. Find your next happy hour with HappiTime.",
  keywords: [
    "Kansas City happy hour guide",
    "KC happy hour tips",
    "best happy hours Kansas City",
    "Westport happy hour",
    "Power and Light happy hour",
    "KC happy hour food deals",
    "Friday happy hour Kansas City",
  ],
  alternates: { canonical: `${BASE}/guides/` },
  openGraph: {
    title: "Kansas City Happy Hour Guides | HappiTime",
    description:
      "Expert guides to Kansas City happy hours — best-of lists, neighborhood spotlights, and insider tips.",
    url: `${BASE}/guides/`,
    type: "website",
    siteName: "HappiTime",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kansas City Happy Hour Guides | HappiTime",
    description:
      "Best-of lists, neighborhood spotlights, and insider tips for KC happy hours.",
  },
};

const guides = [
  {
    href: "/guides/best-happy-hours-kansas-city/",
    title: "The 15 Best Happy Hours in Kansas City (2026)",
    desc: "A curated, neighborhood-by-neighborhood look at the KC happy hours worth planning your evening around.",
  },
  {
    href: "/guides/westport-happy-hour-guide/",
    title: "Westport Happy Hour Guide — Best Bars & Deals",
    desc: "Everything you need to know about happy hour in KC's original entertainment district.",
  },
  {
    href: "/guides/power-and-light-happy-hour-guide/",
    title: "Power & Light District Happy Hour Guide",
    desc: "Rooftop patios, craft cocktails, and downtown energy — the best deals in P&L.",
  },
  {
    href: "/guides/best-happy-hour-food-kansas-city/",
    title: "Best Happy Hour Food Deals in Kansas City",
    desc: "Half-price appetizers, dollar tacos, and discounted plates across every KC neighborhood.",
  },
  {
    href: "/guides/friday-happy-hours-kansas-city/",
    title: "Friday Happy Hours in Kansas City — Where to Go This Weekend",
    desc: "The definitive Friday happy hour plan — early starts, late extensions, and the bars that do it best.",
  },
];

export default function GuidesHub() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      {/* Breadcrumb nav */}
      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <a href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </a>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">Guides</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Kansas City Happy Hour{" "}
        <span className="text-brand">Guides</span>
      </h1>
      <p className="text-muted text-lg mb-10 max-w-2xl">
        Tips, best-of lists, and neighborhood spotlights to help you find the
        perfect happy hour in KC — whether you want cheap eats, craft
        cocktails, or a Friday wind-down spot.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-16">
        {guides.map((g) => (
          <a
            key={g.href}
            href={g.href}
            className="group block rounded-2xl border border-border bg-surface p-6 hover:border-brand hover:shadow-md transition-all"
          >
            <h2 className="text-lg font-bold text-foreground group-hover:text-brand transition-colors mb-2">
              {g.title}
            </h2>
            <p className="text-sm text-muted leading-relaxed">{g.desc}</p>
          </a>
        ))}
      </div>

      {/* Neighborhood quick-links */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Explore by Neighborhood
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            { name: "Westport", href: "/kc/westport/" },
            { name: "Power & Light", href: "/kc/power-and-light/" },
            { name: "Crossroads", href: "/kc/crossroads/" },
            { name: "Plaza", href: "/kc/plaza/" },
            { name: "18th & Vine", href: "/kc/18th-and-vine/" },
            { name: "River Market", href: "/kc/river-market/" },
            { name: "Downtown", href: "/kc/downtown/" },
            { name: "Midtown", href: "/kc/midtown/" },
            { name: "West Bottoms", href: "/kc/west-bottoms/" },
            { name: "Brookside", href: "/kc/brookside/" },
            { name: "Waldo", href: "/kc/waldo/" },
          ].map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted hover:text-brand hover:border-brand transition-colors"
            >
              {n.name}
            </a>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-brand-subtle p-8 sm:p-10 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Find happy hours happening right now
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          Browse live deals across every KC neighborhood or download the app
          for reminders.
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
    </div>
  );
}
