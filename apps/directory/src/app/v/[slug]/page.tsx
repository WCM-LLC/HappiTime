import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getVenueBySlug } from "@/lib/queries";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/storeLinks";
import { isNoRedirect, serverScanSessionId, storeRedirectFor } from "@/lib/storeRedirect";
import { VenueLandingClient } from "./VenueLandingClient";

// QR / deep-link landing: https://happitime.biz/v/{slug}?src=qr
//
// One QR, three outcomes:
//   • App installed  → iOS Universal Link / Android App Link opens the app before
//     this page ever loads (AASA + assetlinks cover /v/*); useVenueDeepLink routes
//     to the venue and on into check-in.
//   • Phone, no app  → this page renders, so we count the scan server-side and
//     302 straight to the App Store / Play Store (zero taps — spec §4 D1).
//   • Desktop / bot / ?nr=1 → the lightweight landing below, where the client
//     component fires `track-visit` and offers app + store + browser links.

export const dynamic = "force-dynamic"; // attribution must run on every hit, not be cached

// Server-side scan count must never hold up the store hand-off for long.
const TRACK_VISIT_TIMEOUT_MS = 1500;

const VALID_SOURCES = new Set(["qr", "app_checkin", "push_click", "organic"]);

/** Record the scan before redirecting away (the client component never runs). */
async function recordServerScan(input: {
  venueId: string;
  slug: string;
  source: string;
  sessionId: string;
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;
  try {
    await fetch(`${url.replace(/\/+$/, "")}/functions/v1/track-visit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        venue_id: input.venueId,
        venue_slug: input.slug,
        source: VALID_SOURCES.has(input.source) ? input.source : "qr",
        session_id: input.sessionId,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TRACK_VISIT_TIMEOUT_MS),
    });
  } catch {
    // Timeout or network error — still send them to the store.
  }
}

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
  searchParams: Promise<{ src?: string; nr?: string | string[] }>;
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
  const { src, nr } = await searchParams;
  const venue = await getVenueBySlug(slug);
  if (!venue) notFound();

  const source = typeof src === "string" && src.length > 0 ? src : "qr";

  // Phone without the app → count the scan, then straight to the right store.
  const h = await headers();
  const userAgent = h.get("user-agent");
  const store = storeRedirectFor({
    userAgent,
    slug: venue.slug,
    noRedirect: isNoRedirect(nr),
    appStoreUrl: APP_STORE_URL,
    playStoreUrl: PLAY_STORE_URL,
  });
  if (store) {
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip");
    await recordServerScan({
      venueId: venue.id,
      slug: venue.slug,
      source,
      sessionId: serverScanSessionId(ip, userAgent),
    });
    redirect(store.url); // throws NEXT_REDIRECT — keep outside any try/catch
  }
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
