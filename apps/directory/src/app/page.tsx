/**
 * HOME PAGE
 * =========
 * When NEXT_PUBLIC_COMING_SOON=true → shows the pre-launch splash page.
 * When not set or false → shows the full live directory homepage.
 *
 * To switch modes:
 *   1. Set the env var in Vercel (Settings → Environment Variables)
 *   2. Redeploy
 */
import { KC_NEIGHBORHOODS } from "@/lib/neighborhoods";
import ComingSoon from "./coming-soon";

const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "HappiTime",
  legalName: "Williams Consulting & Management LLC",
  url: "https://happitime.biz",
  logo: "https://happitime.biz/icon.png",
  description:
    "Happy hour discovery and venue marketing platform connecting consumers with local bars and restaurants.",
  areaServed: {
    "@type": "City",
    name: "Kansas City",
    "@id": "https://www.wikidata.org/wiki/Q41819",
  },
  contactPoint: {
    "@type": "ContactPoint",
    email: "admin@happitime.biz",
    contactType: "customer support",
  },
  sameAs: [],
};

const WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "HappiTime",
  url: "https://happitime.biz",
  description:
    "Find the best happy hours in Kansas City. Browse deals by neighborhood — Westport, Power & Light, Crossroads, Plaza, and more.",
  publisher: { "@type": "Organization", name: "HappiTime" },
};

const isComingSoon = process.env.NEXT_PUBLIC_COMING_SOON === "true";

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSONLD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSONLD) }}
      />

      {isComingSoon ? (
        <ComingSoon />
      ) : (
        <div className="mx-auto max-w-5xl px-6 py-16">
          {/* Hero */}
          <section className="text-center mb-16">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight mb-4">
              Kansas City
              <span className="text-brand"> Happy Hour</span> Guide
            </h1>
            <p className="text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              Find the best happy hour deals near you. Browse by neighborhood, see
              what&apos;s on special right now, and never miss a deal again.
            </p>
          </section>

          {/* Neighborhood grid */}
          <section>
            <h2 className="text-2xl font-bold text-foreground mb-8">
              Browse by Neighborhood
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {KC_NEIGHBORHOODS.map((n) => (
                <a
                  key={n.slug}
                  href={`/kc/${n.slug}/`}
                  className="group block rounded-2xl border border-border bg-surface p-6 hover:border-brand hover:shadow-md transition-all"
                >
                  <h3 className="text-lg font-bold text-foreground group-hover:text-brand transition-colors mb-2">
                    {n.name}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed line-clamp-3">
                    {n.description}
                  </p>
                  <span className="inline-flex items-center mt-4 text-xs font-semibold text-brand">
                    View happy hours →
                  </span>
                </a>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="mt-16 rounded-2xl bg-brand-subtle p-10 text-center">
            <h2 className="text-2xl font-bold text-foreground mb-3">
              Get notified about happy hours near you
            </h2>
            <p className="text-muted mb-6 max-w-lg mx-auto">
              Download HappiTime to save your favorite spots, get reminders when
              happy hour starts, and see what your friends are checking out.
            </p>
            <a
              href="https://apps.apple.com"
              className="inline-block rounded-full bg-brand px-8 py-3 text-white font-semibold hover:bg-brand-dark transition-colors"
            >
              Download the App
            </a>
          </section>
        </div>
      )}
    </>
  );
}
