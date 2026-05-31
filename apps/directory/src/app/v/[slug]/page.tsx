import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVenueBySlug } from "@/lib/queries";
import { VenueLandingClient } from "./VenueLandingClient";

// QR / deep-link landing: https://happitime.biz/v/{slug}?src=qr
// A phone scanning a table-tent QR lands here. The client component fires the
// `track-visit` attribution event and attempts to open the native app, with
// store + "continue in browser" fallbacks. Kept lightweight (no full venue
// chrome) — its job is attribution + routing, not to replace the venue page.

export const dynamic = "force-dynamic"; // attribution must run on every hit, not be cached

const APP_STORE_URL = "https://apps.apple.com/us/app/happitime/id6757933269";
const PLAY_STORE_URL = "https://play.google.com/store/apps/happitime";

// Mirror of the neighborhood→slug mapping used by VenueCard for canonical links.
const NEIGHBORHOOD_SLUGS: Record<string, string> = {
  "Westport": "westport",
  "Power & Light District": "power-and-light",
  "Crossroads": "crossroads",
  "Country Club Plaza": "country-club-plaza",
  "River Market": "river-market",
  "Crown Center": "crown-center",
  "downtown": "downtown",
  "Midtown": "midtown",
  "North Kansas City": "north-kansas-city",
  "Lees Summit": "lees-summit",
};

function neighborhoodToSlug(n: string | null): string {
  if (!n) return "kansas-city";
  return (
    NEIGHBORHOOD_SLUGS[n] ??
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  );
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ src?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getVenueBySlug(slug);
  if (!venue) return { title: "Venue not found — HappiTime" };
  return {
    title: `${venue.name} — Open in HappiTime`,
    description: `Open ${venue.name} in the HappiTime app to see happy hour specials, times, and menu.`,
    robots: { index: false, follow: false }, // utility landing, not for search indexing
  };
}

export default async function VenueQrLandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { src } = await searchParams;
  const venue = await getVenueBySlug(slug);
  if (!venue) notFound();

  const source = typeof src === "string" && src.length > 0 ? src : "qr";
  const webVenueUrl = `/kc/${neighborhoodToSlug(venue.neighborhood)}/${venue.slug}`;
  const appDeepLink = `happitime://venue/${venue.slug}`;

  const windowCount = venue.happy_hour_windows.length;
  const locationLine = [venue.address, venue.city, venue.state].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-[#F5F0EB] px-4 py-12">
      <section className="mx-auto max-w-md">
        <div className="rounded-2xl border border-[#E5E0D8] bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#C8965A]">
            HappiTime
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#1A1A1A]">{venue.name}</h1>
          {locationLine && (
            <p className="mt-1 text-sm text-[#6B6B6B]">{locationLine}</p>
          )}
          {windowCount > 0 && (
            <p className="mt-3 inline-flex items-center rounded-full bg-[#F5F0EB] px-3 py-1 text-sm font-medium text-[#1A1A1A]">
              🍹 {windowCount} happy hour {windowCount === 1 ? "window" : "windows"}
            </p>
          )}

          <VenueLandingClient
            slug={venue.slug}
            venueId={venue.id}
            source={source}
            appDeepLink={appDeepLink}
            webVenueUrl={webVenueUrl}
            appStoreUrl={APP_STORE_URL}
            playStoreUrl={PLAY_STORE_URL}
          />
        </div>

        <p className="mt-4 text-center text-xs text-[#6B6B6B]">
          The happy-hour layer on top of Google — surfacing what Google buries.
        </p>
      </section>
    </main>
  );
}
