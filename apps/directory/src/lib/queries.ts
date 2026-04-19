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
  phone: string | null;
  website: string | null;
  happy_hour_windows: HappyHourWindow[];
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
  lat, lng, price_tier, rating, tags, phone, website
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
    phone: raw.phone ?? null,
    website: raw.website ?? null,
    happy_hour_windows: windows,
  };
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
      `window_id, menus:menu_id(menu_sections(menu_items(id, name, description, price)))`
    )
    .in("window_id", windowIds);

  if (error) {
    console.error("[directory] menu items query failed:", error.message);
    return {};
  }

  const result: Record<string, MenuItem[]> = {};

  for (const row of data ?? []) {
    const wId = (row as any).window_id as string;
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
    .select(`${VENUE_FIELDS}, happy_hour_windows!inner(${WINDOW_FIELDS})`)
    .gte("lat", neighborhood.lat - latDelta)
    .lte("lat", neighborhood.lat + latDelta)
    .gte("lng", neighborhood.lng - lngDelta)
    .lte("lng", neighborhood.lng + lngDelta)
    .eq("happy_hour_windows.status", "published");

  if (error) {
    console.error("[directory] venue query failed:", error.message);
    return [];
  }

  return (data ?? []).map(shapeVenue);
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
    .select(`${VENUE_FIELDS}, happy_hour_windows(${WINDOW_FIELDS})`)
    .eq("slug", slug)
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

  return venue;
}

/**
 * Fetch all published venues in Kansas City for the main KC landing page.
 * Does NOT include menu items.
 */
export async function getAllKCVenues(): Promise<VenueWithWindows[]> {
  const { data, error } = await supabase
    .from("venues")
    .select(`${VENUE_FIELDS}, happy_hour_windows!inner(${WINDOW_FIELDS})`)
    .ilike("city", "%kansas city%")
    .eq("happy_hour_windows.status", "published");

  if (error) {
    console.error("[directory] all KC venues query failed:", error.message);
    return [];
  }

  return (data ?? []).map(shapeVenue);
}
