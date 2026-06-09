import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Public shared-itinerary viewer: https://happitime.biz/i/{share_token}
// Anyone holding the unguessable token can view the itinerary (read-only). Data comes
// from the SECURITY DEFINER RPC get_shared_itinerary(p_token), which bypasses RLS but
// only ever returns a row for an exact token match. Phase 2 adds Universal Links so the
// installed app opens this URL directly; for now this page is the web fallback.

export const dynamic = "force-dynamic";

const APP_STORE_URL = "https://apps.apple.com/us/app/happitime/id6757933269";
const PLAY_STORE_URL = "https://play.google.com/store/apps/happitime";

type SharedItem = {
  venue_id: string;
  name: string;
  slug: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cuisine_type: string | null;
  price_tier: number | null;
  notes: string | null;
};

type SharedItinerary = {
  id: string;
  name: string;
  description: string | null;
  author_handle: string | null;
  author_display_name: string | null;
  items: SharedItem[];
};

async function getSharedItinerary(token: string): Promise<SharedItinerary | null> {
  // Guard: the RPC arg is uuid; a malformed token would error, so bail early.
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return null;
  const { data, error } = await supabase.rpc("get_shared_itinerary", { p_token: token });
  if (error || !data) return null;
  return data as SharedItinerary;
}

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const itinerary = await getSharedItinerary(token);
  if (!itinerary) return { title: "Itinerary not found — HappiTime" };

  const author = itinerary.author_display_name ?? itinerary.author_handle;
  const count = itinerary.items.length;
  const title = `${itinerary.name} — a HappiTime itinerary`;
  const description = author
    ? `${author}'s "${itinerary.name}" itinerary — ${count} ${count === 1 ? "spot" : "spots"} on HappiTime.`
    : `"${itinerary.name}" — ${count} ${count === 1 ? "spot" : "spots"} on HappiTime.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
    robots: { index: false, follow: false }, // private share link, not for search
  };
}

const PRICE = (tier: number | null) => (tier && tier > 0 ? "$".repeat(tier) : null);

function metaLine(item: SharedItem): string {
  return [
    item.cuisine_type,
    PRICE(item.price_tier),
    item.neighborhood ? item.neighborhood.replace(/_/g, " ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function SharedItineraryPage({ params }: Props) {
  const { token } = await params;
  const itinerary = await getSharedItinerary(token);
  if (!itinerary) notFound();

  const author = itinerary.author_display_name ?? itinerary.author_handle;
  const count = itinerary.items.length;

  return (
    <main className="min-h-screen bg-[#F5F0EB] px-4 py-12">
      <section className="mx-auto max-w-md">
        <div className="rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#C8965A]">
            HappiTime Itinerary
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#1A1A1A]">{itinerary.name}</h1>
          {author && (
            <p className="mt-1 text-sm text-[#6B6B6B]">
              Shared by {author}
              {itinerary.author_handle ? ` (@${itinerary.author_handle})` : ""}
            </p>
          )}
          {itinerary.description && itinerary.description !== itinerary.name && (
            <p className="mt-3 text-sm text-[#1A1A1A]">{itinerary.description}</p>
          )}

          <ol className="mt-5 space-y-3">
            {itinerary.items.map((item, idx) => {
              const meta = metaLine(item);
              const location = [item.address, item.city, item.state]
                .filter(Boolean)
                .join(", ");
              return (
                <li
                  key={item.venue_id}
                  className="flex gap-3 rounded-xl border border-[#E5E0D8] bg-[#FAF7F2] p-3"
                >
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#C8965A] text-sm font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1A1A1A]">{item.name}</p>
                    {meta && <p className="mt-0.5 text-xs text-[#6B6B6B]">{meta}</p>}
                    {location && (
                      <p className="mt-0.5 text-xs text-[#6B6B6B]">{location}</p>
                    )}
                    {item.notes && (
                      <p className="mt-1 text-sm text-[#1A1A1A]">“{item.notes}”</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {count === 0 && (
            <p className="mt-4 text-center text-sm text-[#6B6B6B]">
              This itinerary doesn’t have any spots yet.
            </p>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-[#E5E0D8] bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-medium text-[#1A1A1A]">
            Get HappiTime to save this itinerary and discover happy hours near you.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <a
              href={APP_STORE_URL}
              className="rounded-full bg-[#1A1A1A] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Download for iPhone
            </a>
            <a
              href={PLAY_STORE_URL}
              className="rounded-full border border-[#E5E0D8] px-4 py-2.5 text-sm font-semibold text-[#1A1A1A]"
            >
              Download for Android
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
