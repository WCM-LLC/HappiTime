import { KC_NEIGHBORHOODS } from "@/lib/neighborhoods";
import { getAllKCVenues, type VenueWithWindows } from "@/lib/queries";
import { venueImageUrl } from "@/lib/mediaUrl";
import { compareByTier } from "@/lib/venueTier";

/**
 * ONE source for "how many spots are on HappiTime".
 *
 * The site used to say 180+ on /pricing/, 150+ in llms.txt and the live count
 * on /kc/ — three numbers for one fact. Every surface now reads this, which is
 * the same published-venue query /kc/ counts, so they cannot drift apart.
 *
 * The fallback is only used if the venue query fails or comes back empty; it is
 * the count at the time of the Oct 2026 site audit. Update it if the directory
 * grows a lot, but it should almost never be what a visitor sees.
 */
export const VENUE_COUNT_FALLBACK = 212;

export type VenueAvatar = { name: string; slug: string; src: string };

export type DirectoryStats = {
  venueCount: number;
  neighborhoodCount: number;
  /** Real listed venues with a published photo, paid tiers first. */
  avatars: VenueAvatar[];
};

/** Paid tiers first, then the existing display order; only venues with a real photo. */
export function pickVenueAvatars(venues: VenueWithWindows[], max = 7): VenueAvatar[] {
  return [...venues]
    .sort(compareByTier)
    .flatMap((v) => {
      const img = v.venue_media.find(
        (m) => m.type === "image" && m.storage_bucket === "cloudinary"
      );
      if (!img) return [];
      return [
        {
          name: v.name,
          slug: v.slug,
          src: venueImageUrl(img, { w: 96, h: 96, crop: "fill" }),
        },
      ];
    })
    .slice(0, max);
}

export function statsFromVenues(venues: VenueWithWindows[]): DirectoryStats {
  return {
    venueCount: venues.length > 0 ? venues.length : VENUE_COUNT_FALLBACK,
    neighborhoodCount: KC_NEIGHBORHOODS.length,
    avatars: pickVenueAvatars(venues),
  };
}

export async function getDirectoryStats(): Promise<DirectoryStats> {
  try {
    return statsFromVenues(await getAllKCVenues());
  } catch {
    return statsFromVenues([]);
  }
}
