import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  HAPPY_HOUR_LANDING_PAGES,
  getHappyHourLandingPage,
  getNeighborhoodForLandingPage,
} from "@/lib/seoNeighborhoods";
import { getVenuesByNeighborhood } from "@/lib/queries";
import { breadcrumbJsonLd } from "@/lib/structuredData";
import { NeighborhoodVenues } from "@/components/NeighborhoodVenues";
import { PageTracker } from "@/components/PageTracker";

export const revalidate = 900;

type Props = { params: Promise<{ neighborhood: string }> };

export async function generateStaticParams() {
  return HAPPY_HOUR_LANDING_PAGES.map((page) => ({
    neighborhood: page.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { neighborhood: slug } = await params;
  const page = getHappyHourLandingPage(slug);
  if (!page) return {};

  return {
    title: {
      absolute: `${page.h2} | HappiTime`,
    },
    description: page.metaDescription,
    keywords: [
      page.h2.toLowerCase(),
      `${page.h2.toLowerCase()} deals`,
      `${page.h2.toLowerCase()} drink specials`,
      `${page.h2.toLowerCase()} food deals`,
      "Kansas City happy hour",
      "KC happy hour deals",
    ],
    alternates: {
      canonical: page.canonicalPath,
    },
    openGraph: {
      type: "website",
      title: `${page.h2} | HappiTime`,
      description: page.metaDescription,
      url: `https://happitime.biz${page.canonicalPath}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.h2} | HappiTime`,
      description: page.metaDescription,
    },
  };
}

export default async function HappyHourNeighborhoodPage({ params }: Props) {
  const { neighborhood: slug } = await params;
  const page = getHappyHourLandingPage(slug);
  if (!page) notFound();

  const neighborhood = getNeighborhoodForLandingPage(page);
  if (!neighborhood) notFound();

  const venues = await getVenuesByNeighborhood(neighborhood);
  const todayIndex = new Date().getDay();

  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: "https://happitime.biz/" },
    { name: "Kansas City", url: "https://happitime.biz/kc/" },
    {
      name: page.h2,
      url: `https://happitime.biz${page.canonicalPath}`,
    },
  ]);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: page.h2,
    description: page.intro,
    numberOfItems: venues.length,
    itemListElement: venues.map((venue, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: venue.name,
      url: `https://happitime.biz/kc/${neighborhood.slug}/${venue.slug}/`,
    })),
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <PageTracker pagePath={page.canonicalPath} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted">
        <a href="/" className="transition-colors hover:text-foreground">
          HappiTime
        </a>
        <span className="text-muted-light">/</span>
        <a href="/kc/" className="transition-colors hover:text-foreground">
          Kansas City
        </a>
        <span className="text-muted-light">/</span>
        <span className="font-medium text-foreground">{neighborhood.name}</span>
      </nav>

      <h2 className="mb-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {page.h2}
      </h2>
      <p className="mb-4 max-w-2xl text-lg text-muted">{page.intro}</p>
      <p className="mb-10 text-sm text-muted-light">
        {venues.length} {venues.length === 1 ? "venue" : "venues"} with active
        happy hour specials
      </p>

      <NeighborhoodVenues
        venues={venues}
        neighborhoodSlug={neighborhood.slug}
        neighborhoodName={neighborhood.name}
        todayIndex={todayIndex}
      />
    </div>
  );
}
