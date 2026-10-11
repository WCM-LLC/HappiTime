import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  KC_NEIGHBORHOODS,
  OTHER_KC_SLUG,
  bestNeighborhoodSlug,
  getNeighborhood,
  venuePath,
} from "@/lib/neighborhoods";
import { getHappyHourLandingPageByNeighborhoodSlug } from "@/lib/seoNeighborhoods";
import { getAllKCVenues, getVenuesByNeighborhood } from "@/lib/queries";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdHtml, webPageJsonLd } from "@/lib/structuredData";
import { NeighborhoodVenues } from "@/components/NeighborhoodVenues";
import { PageTracker } from "@/components/PageTracker";
import { DEFAULT_OG_IMAGE, fitDescription } from "@/lib/seoText";

export const revalidate = 900;

type Props = { params: Promise<{ neighborhood: string }> };

export async function generateStaticParams() {
  return [...KC_NEIGHBORHOODS.map((n) => ({ neighborhood: n.slug })), { neighborhood: OTHER_KC_SLUG }];
}

// /kc/kansas-city/ — the hub for venues outside every neighborhood radius. Their
// detail pages live under this segment, and without a page listing them they
// were reachable only from the sitemap.
const OTHER_KC_TITLE = "Happy Hours Elsewhere in Kansas City";
const OTHER_KC_DESCRIPTION = fitDescription([
  "Kansas City happy hours at spots outside the neighborhoods HappiTime groups by.",
  "Happy hour times and drink and food specials, where each spot publishes them.",
]);

async function getOtherKCVenues() {
  return (await getAllKCVenues())
    // Every venue under this segment, as the neighborhood pages list theirs —
    // including ones with no published happy hour yet (they have a page too).
    .filter((v) => bestNeighborhoodSlug(v) === OTHER_KC_SLUG)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { neighborhood: slug } = await params;
  if (slug === OTHER_KC_SLUG) {
    return {
      title: OTHER_KC_TITLE,
      description: OTHER_KC_DESCRIPTION,
      alternates: { canonical: `/kc/${OTHER_KC_SLUG}/` },
      openGraph: {
        images: [DEFAULT_OG_IMAGE],
        title: OTHER_KC_TITLE,
        description: OTHER_KC_DESCRIPTION,
        url: `https://happitime.biz/kc/${OTHER_KC_SLUG}/`,
      },
    };
  }
  const n = getNeighborhood(slug);
  if (!n) return {};
  const landingPage = getHappyHourLandingPageByNeighborhoodSlug(slug);

  if (landingPage) {
    return {
      title: {
        absolute: `${landingPage.h2} | HappiTime`,
      },
      description: landingPage.metaDescription,
      alternates: {
        canonical: landingPage.canonicalPath,
      },
    };
  }

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
      images: [DEFAULT_OG_IMAGE],
      title: `${n.name} Happy Hour Deals & Specials — HappiTime`,
      description: `Today's happy hour deals in ${n.name}, Kansas City — drink specials, food deals, and more.`,
    },
  };
}

export default async function NeighborhoodPage({ params }: Props) {
  const { neighborhood: slug } = await params;
  if (slug === OTHER_KC_SLUG) return <OtherKCHub />;
  const neighborhood = getNeighborhood(slug);
  if (!neighborhood) notFound();
  const landingPage = getHappyHourLandingPageByNeighborhoodSlug(slug);

  if (landingPage) {
    permanentRedirect(landingPage.canonicalPath);
  }

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
              url: `https://happitime.biz${venuePath(v)}`,
            })),
          }),
        }}
      />

      {/* Breadcrumb nav */}
      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </Link>
        <span className="text-muted-light">/</span>
        <Link href="/kc/" className="hover:text-foreground transition-colors">
          Kansas City
        </Link>
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
            .map((n) => {
              const landingPage = getHappyHourLandingPageByNeighborhoodSlug(
                n.slug
              );

              return (
                <a
                  key={n.slug}
                  href={landingPage?.canonicalPath ?? `/kc/${n.slug}/`}
                  className="block rounded-xl border border-border bg-surface p-4 hover:border-brand hover:shadow-sm transition-all"
                >
                  <p className="font-semibold text-foreground text-sm group-hover:text-brand">
                    {n.name}
                  </p>
                  <p className="text-xs text-muted mt-1 line-clamp-2">
                    {n.description}
                  </p>
                </a>
              );
            })}
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

async function OtherKCHub() {
  const venues = await getOtherKCVenues();
  const url = `https://happitime.biz/kc/${OTHER_KC_SLUG}/`;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <PageTracker pagePath={`/kc/${OTHER_KC_SLUG}/`} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml(
          webPageJsonLd({ type: "CollectionPage", name: OTHER_KC_TITLE, url, description: OTHER_KC_DESCRIPTION }),
        )}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml(
          breadcrumbJsonLd([
            { name: "HappiTime", url: "https://happitime.biz/" },
            { name: "Kansas City", url: "https://happitime.biz/kc/" },
            { name: "Elsewhere in Kansas City", url },
          ]),
        )}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml(
          itemListJsonLd(venues.map((v) => ({ name: v.name, url: `https://happitime.biz${venuePath(v)}` }))),
        )}
      />

      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </Link>
        <span className="text-muted-light">/</span>
        <Link href="/kc/" className="hover:text-foreground transition-colors">
          Kansas City
        </Link>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">Elsewhere in Kansas City</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
        Happy Hours <span className="text-brand">Elsewhere in Kansas City</span>
      </h1>
      <p className="text-muted text-lg mb-4 max-w-2xl">
        These Kansas City spots sit outside the neighborhoods we group by. Each page shows the happy hour times and
        specials, where the spot publishes them.
      </p>
      <p className="text-sm text-muted-light mb-10">
        {venues.length} {venues.length === 1 ? "venue" : "venues"} listed,{" "}
        {venues.filter((v) => v.happy_hour_windows.length > 0).length} with a published happy hour
      </p>

      <NeighborhoodVenues venues={venues} neighborhoodName="Kansas City" todayIndex={new Date().getDay()} />

      <section className="mt-16 mb-10">
        <h2 className="text-xl font-bold text-foreground mb-4">Browse by neighborhood</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {KC_NEIGHBORHOODS.map((n) => (
            <a
              key={n.slug}
              href={getHappyHourLandingPageByNeighborhoodSlug(n.slug)?.canonicalPath ?? `/kc/${n.slug}/`}
              className="block rounded-xl border border-border bg-surface p-4 hover:border-brand hover:shadow-sm transition-all"
            >
              <p className="font-semibold text-foreground text-sm">{n.name}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
