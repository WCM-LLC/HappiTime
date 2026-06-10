import { supabase } from "./supabase";
import type { Neighborhood } from "./neighborhoods";

export type VenueWithWindows = {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  price_tier: number | null;
  rating: number | null;
  tags: string[];
  cuisine_type: string | null;
  phone: string | null;
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  promotion_tier: string | null;
  promotion_priority: number;
  happy_hour_windows: HappyHourWindow[];
  venue_events: VenueEvent[];
  venue_media: VenueMediaItem[];
};

export type VenueEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  price_info: string | null;
  external_url: string | null;
  ticket_url: string | null;
  cover_image_path: string | null;
};

export type VenueMediaItem = {
  id: string;
  type: string;
  title: string | null;
  storage_bucket: string;
  storage_path: string;
  sort_order: number;
  source: string;
};

export type HappyHourWindow = {
  id: string;
  label: string | null;
  dow: number[];
  start_time: string;
  end_time: string;
  menu_items: MenuItem[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  category: string | null;
};

/*
 * Schema relationship chain for menus:
 *   happy_hour_windows
 *     → happy_hour_window_menus (join table)
 *       → menus
 *         → menu_sections
 *           → menu_items
 *
 * Listing pages fetch venues + windows only (no menus) to keep the query simple.
 * The detail page fetches menu items in a separate query via the join table.
 */

const VENUE_FIELDS = `
  id, name, slug, address, city, state, neighborhood,
  lat, lng, price_tier, rating, tags, cuisine_type, phone, website,
  facebook_url, instagram_url, tiktok_url,
  promotion_tier, promotion_priority
`;

const WINDOW_FIELDS = `id, label, dow, start_time, end_time, status`;

/**
 * Shape a raw venue row (no menus) into VenueWithWindows with empty menu_items.
 */
function shapeVenue(raw: any): VenueWithWindows {
  const windows = (raw.happy_hour_windows ?? []).map((w: any) => ({
    id: w.id,
    label: w.label ?? null,
    dow: w.dow ?? [],
    start_time: w.start_time,
    end_time: w.end_time,
    menu_items: [] as MenuItem[],
  }));

  const events = (raw.venue_events ?? []).map((e: any) => ({
    id: e.id,
    title: e.title,
    description: e.description ?? null,
    event_type: e.event_type,
    starts_at: e.starts_at,
    ends_at: e.ends_at ?? null,
    is_recurring: e.is_recurring ?? false,
    recurrence_rule: e.recurrence_rule ?? null,
    price_info: e.price_info ?? null,
    external_url: e.external_url ?? null,
    ticket_url: e.ticket_url ?? null,
    cover_image_path: e.cover_image_path ?? null,
  }));

  const SOURCE_PRIORITY: Record<string, number> = {
    upload: 0,
    website: 1,
    google_places: 2,
    unsplash: 3,
    unknown: 4,
  };

  const media = (raw.venue_media ?? [])
    .map((m: any) => ({
      id: m.id,
      type: m.type,
      title: m.title ?? null,
      storage_bucket: m.storage_bucket ?? 'venue-media',
      storage_path: m.storage_path,
      sort_order: m.sort_order,
      source: m.source ?? 'unknown',
    }))
    .sort((a: VenueMediaItem, b: VenueMediaItem) => {
      const pa = SOURCE_PRIORITY[a.source] ?? 4;
      const pb = SOURCE_PRIORITY[b.source] ?? 4;
      if (pa !== pb) return pa - pb;
      return a.sort_order - b.sort_order;
    });

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    address: raw.address,
    city: raw.city,
    state: raw.state,
    neighborhood: raw.neighborhood ?? null,
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
    price_tier: raw.price_tier ?? null,
    rating: raw.rating != null ? Number(raw.rating) : null,
    tags: raw.tags ?? [],
    cuisine_type: raw.cuisine_type ?? null,
    phone: raw.phone ?? null,
    website: raw.website ?? null,
    facebook_url: raw.facebook_url ?? null,
    instagram_url: raw.instagram_url ?? null,
    tiktok_url: raw.tiktok_url ?? null,
    promotion_tier: raw.promotion_tier ?? null,
    promotion_priority: raw.promotion_priority ?? 0,
    happy_hour_windows: windows,
    venue_events: events,
    venue_media: media,
  };
}

/**
 * Override each venue's promotion_tier with the effective tier from
 * v_venue_active_tier (which folds in the active org-bundle override). A present
 * view row wins; a missing row leaves the venue untouched, so a failed/empty view
 * fetch degrades to the raw promotion_tier (fail-open). Pure + unit-tested in
 * test/venue-active-tier.test.mjs.
 */
export function mergeEffectiveTiers<T extends { id: string; promotion_tier: string | null }>(
  venues: T[],
  tierRows: { venue_id: string; tier: string | null }[]
): T[] {
  const byId = new Map(tierRows.map((r) => [r.venue_id, r.tier]));
  return venues.map((v) =>
    byId.has(v.id) ? { ...v, promotion_tier: byId.get(v.id) ?? v.promotion_tier } : v
  );
}

/**
 * Fetch effective tiers from v_venue_active_tier for the given venues and merge
 * them in. One extra batched query per listing; on error the venues pass through
 * unchanged (fail-open).
 */
async function withEffectiveTiers(
  venues: VenueWithWindows[]
): Promise<VenueWithWindows[]> {
  if (venues.length === 0) return venues;

  const { data, error } = await supabase
    .from("v_venue_active_tier")
    .select("venue_id, tier")
    .in("venue_id", venues.map((v) => v.id));

  if (error) {
    console.error("[directory] active-tier query failed:", error.message);
    return venues;
  }

  return mergeEffectiveTiers(venues, (data ?? []) as { venue_id: string; tier: string | null }[]);
}

/**
 * Fetch menu items for a set of happy hour window IDs.
 * Uses the join table chain: happy_hour_window_menus → menus → menu_sections → menu_items.
 * Returns a map of windowId → MenuItem[].
 */
async function fetchMenuItemsByWindowIds(
  windowIds: string[]
): Promise<Record<string, MenuItem[]>> {
  if (windowIds.length === 0) return {};

  const { data, error } = await supabase
    .from("happy_hour_window_menus")
    .select(
      `happy_hour_window_id, menus:menu_id(menu_sections(menu_items(id, name, description, price)))`
    )
    .in("happy_hour_window_id", windowIds);

  if (error) {
    console.error("[directory] menu items query failed:", error.message);
    return {};
  }

  const result: Record<string, MenuItem[]> = {};

  for (const row of data ?? []) {
    const wId = (row as any).happy_hour_window_id as string;
    if (!result[wId]) result[wId] = [];

    const menu = (row as any).menus;
    if (!menu) continue;
    for (const section of menu.menu_sections ?? []) {
      for (const item of section.menu_items ?? []) {
        result[wId].push({
          id: item.id,
          name: item.name,
          description: item.description ?? null,
          price: item.price != null ? Number(item.price) : null,
          category: null,
        });
      }
    }
  }

  return result;
}

/**
 * Fetch all published venues with happy hour windows in a neighborhood.
 * Does NOT include menu items — cards don't need them.
 */
export async function getVenuesByNeighborhood(
  neighborhood: Neighborhood
): Promise<VenueWithWindows[]> {
  const latDelta = neighborhood.radiusMiles / 69;
  const lngDelta =
    neighborhood.radiusMiles /
    (69 * Math.cos((neighborhood.lat * Math.PI) / 180));

  const { data, error } = await supabase
    .from("venues")
    .select(`${VENUE_FIELDS}, happy_hour_windows(${WINDOW_FIELDS}), venue_events(id, title, description, event_type, starts_at, ends_at, is_recurring, recurrence_rule, price_info), venue_media(id, type, title, storage_bucket, storage_path, sort_order, source)`)
    .gte("lat", neighborhood.lat - latDelta)
    .lte("lat", neighborhood.lat + latDelta)
    .gte("lng", neighborhood.lng - lngDelta)
    .lte("lng", neighborhood.lng + lngDelta)
    .eq("happy_hour_windows.status", "published")
    .eq("venue_events.status", "published")
    .eq("venue_media.status", "published");

  if (error) {
    console.error("[directory] venue query failed:", error.message);
    return [];
  }

  return withEffectiveTiers((data ?? []).map(shapeVenue));
}

/**
 * Fetch a single venue by slug with all its published happy hour windows
 * AND their menu items (fetched separately via the join table).
 */
export async function getVenueBySlug(
  slug: string
): Promise<VenueWithWindows | null> {
  const { data, error } = await supabase
    .from("venues")
    .select(`
      ${VENUE_FIELDS},
      happy_hour_windows(${WINDOW_FIELDS}),
      venue_events(id, title, description, event_type, starts_at, ends_at, is_recurring, recurrence_rule, price_info, external_url, ticket_url, cover_image_path),
      venue_media(id, type, title, storage_bucket, storage_path, sort_order, source)
    `)
    .eq("slug", slug)
    .eq("venue_events.status", "published")
    .eq("venue_media.status", "published")
    .maybeSingle();

  if (error || !data) return null;

  // Filter to published windows
  const publishedWindows = ((data as any).happy_hour_windows ?? []).filter(
    (w: any) => w.status === "published"
  );

  const venue = shapeVenue({ ...data, happy_hour_windows: publishedWindows });

  // Fetch menu items for each window in a separate query
  const windowIds = venue.happy_hour_windows.map((w) => w.id);
  const menuMap = await fetchMenuItemsByWindowIds(windowIds);

  // Attach menu items to their windows
  for (const w of venue.happy_hour_windows) {
    w.menu_items = menuMap[w.id] ?? [];
  }

  // Override promotion_tier with the effective tier (shares the windows array,
  // so the menu items attached above are preserved on the returned object).
  const [venueWithTier] = await withEffectiveTiers([venue]);
  return venueWithTier;
}

// ─── Public profile ───────────────────────────────────────────────────────────

export type PublicProfile = {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Fetch a single public user profile by handle (case-insensitive).
 * Returns null if the handle is not found or the profile is not public.
 * Uses the anon client; permitted by the user_profiles_select_owner_or_public
 * RLS policy (is_public = true branch is open to anon).
 */
export async function getPublicProfileByHandle(
  handle: string
): Promise<PublicProfile | null> {
  // Normalize: strip leading @, lowercase. Handles are stored lowercase
  // (useUserProfile normalizeHandle does the same). Exact match avoids the
  // ILIKE wildcard pitfall where _ matches any single character.
  const clean = handle.replace(/^@/, "").toLowerCase();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("handle, display_name, avatar_url")
    .eq("handle", clean)
    .eq("is_public", true)
    .maybeSingle();

  if (error || !data) return null;
  return {
    handle: (data as any).handle as string,
    display_name: (data as any).display_name as string | null,
    avatar_url: (data as any).avatar_url as string | null,
  };
}

/**
 * Fetch all published venues in Kansas City for the main KC landing page.
 * Does NOT include menu items.
 */
export async function getAllKCVenues(): Promise<VenueWithWindows[]> {
  const { data, error } = await supabase
    .from("venues")
    .select(`${VENUE_FIELDS}, happy_hour_windows(${WINDOW_FIELDS}), venue_events(id, title, description, event_type, starts_at, ends_at, is_recurring, recurrence_rule, price_info), venue_media(id, type, title, storage_bucket, storage_path, sort_order, source)`)
    .ilike("city", "%kansas city%")
    .eq("happy_hour_windows.status", "published")
    .eq("venue_events.status", "published")
    .eq("venue_media.status", "published");

  if (error) {
    console.error("[directory] all KC venues query failed:", error.message);
    return [];
  }

  return withEffectiveTiers((data ?? []).map(shapeVenue));
}
