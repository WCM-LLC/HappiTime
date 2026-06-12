import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  HAPPY_HOUR_LANDING_PAGES,
  getHappyHourLandingPage,
  getNeighborhoodForLandingPage,
} from "@/lib/seoNeighborhoods";
import { getVenuesByNeighborhood, type VenueWithWindows } from "@/lib/queries";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/lib/structuredData";
import { NeighborhoodVenues } from "@/components/NeighborhoodVenues";
import { PageTracker } from "@/components/PageTracker";

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0
    ? `${hour} ${period}`
    : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Build a data-driven FAQ for a neighborhood landing page.
 * Answers are computed from live venue data so the visible text and the
 * FAQPage JSON-LD always match — a hard requirement for rich results and
 * the format AI assistants extract most reliably.
 */
function buildNeighborhoodFaqs(
  neighborhoodName: string,
  venues: VenueWithWindows[]
): { question: string; answer: string }[] {
  if (venues.length === 0) return [];

  const windows = venues.flatMap((v) => v.happy_hour_windows);
  const faqs: { question: string; answer: string }[] = [];

  if (windows.length > 0) {
    const starts = windows.map((w) => w.start_time).sort();
    const ends = windows.map((w) => w.end_time).sort();
    const earliest = formatTime(starts[0]);
    const latest = formatTime(ends[ends.length - 1]);
    faqs.push({
      question: `What time is happy hour in ${neighborhoodName}?`,
      answer: `Most ${neighborhoodName} happy hours run on weekday afternoons. Across the ${venues.length} venues HappiTime tracks in ${neighborhoodName}, the earliest specials start at ${earliest} and the latest run until ${latest}. Exact times vary by venue and day — each listing shows its current schedule.`,
    });
  }

  faqs.push({
    question: `How many bars and restaurants in ${neighborhoodName} have happy hour specials?`,
    answer: `HappiTime currently tracks ${venues.length} ${
      venues.length === 1 ? "venue" : "venues"
    } with happy hour specials in ${neighborhoodName}, Kansas City. Listings are updated daily by the venues themselves.`,
  });

  const topRated = venues
    .filter((v) => v.rating != null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 3);
  if (topRated.length >= 2) {
    faqs.push({
      question: `What are the best happy hours in ${neighborhoodName}?`,
      answer: `Top-rated happy hour spots in ${neighborhoodName} on HappiTime include ${topRated
        .map((v) => `${v.name} (★ ${v.rating})`)
        .join(", ")}. Browse all ${venues.length} venues for current drink and food specials.`,
    });
  }

  faqs.push({
    question: "How do I find current happy hour deals near me in Kansas City?",
    answer:
      "HappiTime is a free Kansas City happy hour guide, on the web and as an iPhone and Android app. Deals are posted and updated daily by venues, so times and specials reflect what is actually running today.",
  });

  return faqs;
}

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

  const faqs = buildNeighborhoodFaqs(neighborhood.name, venues);

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
      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqPageJsonLd(faqs)),
          }}
        />
      )}

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

      {faqs.length > 0 && (
        <section className="mt-16 border-t border-muted-light/30 pt-10">
          <h3 className="mb-6 text-2xl font-extrabold tracking-tight text-foreground">
            {neighborhood.name} Happy Hour FAQ
          </h3>
          <dl className="space-y-6 max-w-3xl">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="mb-1.5 font-semibold text-foreground">
                  {faq.question}
                </dt>
                <dd className="text-muted">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
