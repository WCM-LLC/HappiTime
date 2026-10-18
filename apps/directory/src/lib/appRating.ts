/**
 * Live App Store rating for the HappiTime iOS app, straight from Apple's public
 * lookup endpoint. Nothing here is typed in by hand: if Apple returns no
 * ratings, or the request fails, this returns null and the UI shows nothing.
 *
 * Cached for a day — a rating count does not need to be fresher than that, and
 * it keeps Apple out of the request path.
 */
const LOOKUP_URL = "https://itunes.apple.com/lookup?id=6757933269&country=us";

/** Raise this if you would rather not show a rating until it has more votes behind it. */
export const MIN_RATINGS_TO_SHOW = 1;

export type AppRating = { rating: number; count: number };

export async function getAppStoreRating(): Promise<AppRating | null> {
  try {
    const res = await fetch(LOOKUP_URL, { next: { revalidate: 86_400 } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: { averageUserRating?: number; userRatingCount?: number }[];
    };
    const app = json.results?.[0];
    const rating = Number(app?.averageUserRating);
    const count = Number(app?.userRatingCount);
    if (!Number.isFinite(rating) || !Number.isFinite(count)) return null;
    if (count < MIN_RATINGS_TO_SHOW || rating <= 0) return null;
    return { rating, count };
  } catch {
    return null;
  }
}

/** "5.0 on the App Store · 3 ratings" */
export function formatAppRating({ rating, count }: AppRating): string {
  return `${rating.toFixed(1)} on the App Store · ${count} rating${count === 1 ? "" : "s"}`;
}
