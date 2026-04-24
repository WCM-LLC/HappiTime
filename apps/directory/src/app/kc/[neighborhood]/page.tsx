import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  KC_NEIGHBORHOODS,
  getNeighborhood,
} from "@/lib/neighborhoods";
import { getVenuesByNeighborhood } from "@/lib/queries";
import { breadcrumbJsonLd } from "@/lib/structuredData";
import { NeighborhoodVenues } from "@/components/NeighborhoodVenues";
import { PageTracker } from "@/components/PageTracker";

export const revalidate = 900;

type Props = { params: Promise<{ neighborhood: string }> };

export async function generateStaticParams() {
  return KC_NEIGHBORHOODS.map((n) => ({ neighborhood: n.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { neighborhood: slug } = await params;
  const n = getNeighborhood(slug);
  if (!n) return {};

  return {
    title: `${n.name} Happy Hour Deals & Specials — Kansas City | HappiTime`,
    description: `Discover today's best happy hour deals in ${n.name}, Kansas City — daily updated drink specials, food specials, and bar discounts for 2026. ${n.description}`,
    keywords: [
      `${n.name} happy hour`,
      `${n.name} happy hour deals`,
      `${n.name} drink specials`,
      `${n.name} food specials`,
      `${n.name} Kansas City bars`,
      `happy hour ${n.name} KC`,
      `best happy hour ${n.name}`,
    ],
    alternates: {
      canonical: `/kc/${slug}/`,
    },
    openGraph: {
      title: `${n.name} Happy Hour Deals & Specials — HappiTime`,
      description: `Today's happy hour deals in ${n.name}, Kansas City — drink specials, food deals, and more.`,
    },
  };
}

export default async function NeighborhoodPage({ params }: Props) {
  const { neighborhood: slug } = await params;
  const neighborhood = getNeighborhood(slug);
  if (!neighborhood) notFound();

  const venues = await getVenuesByNeighborhood(neighborhood);
  const todayIndex = new Date().getDay();

  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: "https://happitime.biz/" },
    { name: "Kansas City", url: "https://happitime.biz/kc/" },
    {
      name: neighborhood.name,
      url: `https://happitime.biz/kc/${neighborhood.slug}/`,
    },
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <PageTracker pagePath={`/kc/${neighborhood.slug}/`} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Happy Hour Venues in ${neighborhood.name}`,
            numberOfItems: venues.length,
            itemListElement: venues.map((v, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: v.name,
              url: `https://happitime.biz/kc/${neighborhood.slug}/${v.slug}/`,
            })),
          }),
        }}
      />

      {/* Breadcrumb nav */}
      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <a href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </a>
        <span className="text-muted-light">/</span>
        <a href="/kc/" className="hover:text-foreground transition-colors">
          Kansas City
        </a>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">{neighborhood.name}</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Happy Hours in{" "}
        <span className="text-brand">{neighborhood.name}</span>
      </h1>
      <p className="text-muted text-lg mb-4 max-w-2xl">{neighborhood.description}</p>
      <p className="text-sm text-muted-light mb-10">
        {venues.length} {venues.length === 1 ? "venue" : "venues"} with active
        happy hour specials
      </p>

      {/* Interactive day filter + venue grid (client component) */}
      <NeighborhoodVenues
        venues={venues}
        neighborhoodSlug={neighborhood.slug}
        neighborhoodName={neighborhood.name}
        todayIndex={todayIndex}
      />

      {/* Did we miss one? */}
      <div className="mt-12 text-center">
        <a
          href="/contactus"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Did we miss one? Suggest a venue
        </a>
      </div>

      {/* Nearby Neighborhoods */}
      <section className="mt-16 mb-10">
        <h2 className="text-xl font-bold text-foreground mb-4">
          Nearby Neighborhoods
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {KC_NEIGHBORHOODS.filter((n) => n.slug !== neighborhood.slug)
            .slice(0, 4)
            .map((n) => (
              <a
                key={n.slug}
                href={`/kc/${n.slug}/`}
                className="block rounded-xl border border-border bg-surface p-4 hover:border-brand hover:shadow-sm transition-all"
              >
                <p className="font-semibold text-foreground text-sm group-hover:text-brand">
                  {n.name}
                </p>
                <p className="text-xs text-muted mt-1 line-clamp-2">
                  {n.description}
                </p>
              </a>
            ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-16 rounded-2xl bg-brand-subtle p-8 sm:p-10 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Never miss happy hour in {neighborhood.name}
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          Get reminders when your favorite spots start their specials.
        </p>
        <a
          href="/app/"
          className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
        >
          Get the App
        </a>
      </section>
    </div>
  );
}
