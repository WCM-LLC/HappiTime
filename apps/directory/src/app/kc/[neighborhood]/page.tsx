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
    title: `Happy Hours in ${n.name}, Kansas City`,
    description: `${n.description} Find today's happy hour deals, menus, and times in ${n.name}.`,
    openGraph: {
      title: `Happy Hours in ${n.name} — HappiTime`,
      description: n.description,
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

      {/* CTA */}
      <section className="mt-16 rounded-2xl bg-brand-subtle p-8 sm:p-10 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Never miss happy hour in {neighborhood.name}
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          Get reminders when your favorite spots start their specials.
        </p>
        <a
          href="https://apps.apple.com"
          className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
        >
          Get the App
        </a>
      </section>
    </div>
  );
}
