// packages/shared-api/src/happyhour.ts

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  HappyHourPlace,
  Organization,
  Venue,
  HappyHourWindow,
  HappyHourOffer
} from "@happitime/shared-types";
import { createSupabaseClient } from "./client";

export type HappyHourWindowWithVenueAndOffers = HappyHourWindow & {
  venue: Venue | null;
  offers: HappyHourOffer[];
};

export type VenueWithOrganization = Venue & {
  org?: Organization | null;
};

export type HappyHourPlaceStatus =
  | "draft"
  | "pending_review"
  | "verified"
  | "paused"
  | "expired";

export type FetchHappyHourPlacesOptions = {
  supabase?: SupabaseClient<Database>;
  limit?: number;
  offset?: number;
  status?: HappyHourPlaceStatus;
  statuses?: HappyHourPlaceStatus[];
  search?: string;
  day?: string;
  days?: string[];
  cuisineTypes?: string[];
  minPrice?: number;
  maxPrice?: number;
  minDistance?: number;
  maxDistance?: number;
  orderBy?: keyof HappyHourPlace;
  ascending?: boolean;
};

type FetchVenueWithWindowsOptions = {
  supabase?: SupabaseClient<Database>;
  orgId?: string;
  includeOrganization?: boolean;
  status?: string;
};

/**
 * Fetch "flattened" happy hour places from public.happy_hour_places.
 */
export async function fetchHappyHourPlaces(
  opts?: FetchHappyHourPlacesOptions
): Promise<HappyHourPlace[]> {
  const supabase = opts?.supabase ?? createSupabaseClient();

  const orderBy = opts?.orderBy ?? "distance_miles";
  const ascending = opts?.ascending ?? true;

  let query = supabase
    .from("happy_hour_places")
    .select("*")
    .order(orderBy, { ascending });

  if (opts?.statuses?.length) {
    query = query.in("status", opts.statuses);
  } else if (opts?.status) {
    query = query.eq("status", opts.status);
  }

  const search = opts?.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      [
        `name.ilike.${pattern}`,
        `venue_name.ilike.${pattern}`,
        `org_name.ilike.${pattern}`,
        `address.ilike.${pattern}`,
        `neighborhood.ilike.${pattern}`
      ].join(",")
    );
  }

  if (opts?.days?.length) {
    query = query.overlaps("happy_days", opts.days);
  } else if (opts?.day) {
    query = query.contains("happy_days", [opts.day]);
  }

  if (opts?.cuisineTypes?.length) {
    query = query.in("cuisine_type", opts.cuisineTypes);
  }

  if (typeof opts?.minPrice === "number") {
    query = query.gte("average_price", opts.minPrice);
  }

  if (typeof opts?.maxPrice === "number") {
    query = query.lte("average_price", opts.maxPrice);
  }

  if (typeof opts?.minDistance === "number") {
    query = query.gte("distance_miles", opts.minDistance);
  }

  if (typeof opts?.maxDistance === "number") {
    query = query.lte("distance_miles", opts.maxDistance);
  }

  const limit = opts?.limit;
  const offset = opts?.offset;

  if (typeof limit === "number" && typeof offset === "number") {
    query = query.range(offset, offset + Math.max(0, limit - 1));
  } else if (typeof limit === "number") {
    query = query.limit(limit);
  } else if (typeof offset === "number") {
    const fallbackLimit = 50;
    query = query.range(offset, offset + fallbackLimit - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchHappyHourPlaces error:", error);
    throw error;
  }

  return data ?? [];
}

/**
 * Fetch published happy hour windows with venue + offer details.
 */
export async function fetchPublishedHappyHourWindows(opts?: {
  limit?: number;
  supabase?: SupabaseClient<Database>;
}): Promise<HappyHourWindowWithVenueAndOffers[]> {
  const supabase = opts?.supabase ?? createSupabaseClient();

  let query = supabase
    .from("happy_hour_windows")
    .select("*, venue:venues (*), offers:happy_hour_offers (*)")
    .eq("status", "published")
    .order("start_time", { ascending: true });

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchPublishedHappyHourWindows error:", error);
    throw error;
  }

  return (data ?? []) as HappyHourWindowWithVenueAndOffers[];
}

/**
 * Fetch a venue and its published windows from normalized tables.
 */
export async function fetchVenueWithWindows(
  venueId: string,
  opts?: FetchVenueWithWindowsOptions & { throwOnError?: true }
): Promise<{
  venue: VenueWithOrganization;
  windows: HappyHourWindow[];
}>;
export async function fetchVenueWithWindows(
  venueId: string,
  opts: FetchVenueWithWindowsOptions & { throwOnError: false }
): Promise<{
  venue: VenueWithOrganization | null;
  windows: HappyHourWindow[];
  venueError: PostgrestError | null;
  windowsError: PostgrestError | null;
}>;
export async function fetchVenueWithWindows(
  venueId: string,
  opts?: FetchVenueWithWindowsOptions & { throwOnError?: boolean }
) {
  const supabase = opts?.supabase ?? createSupabaseClient();
  const includeOrganization = opts?.includeOrganization ?? false;
  const throwOnError = opts?.throwOnError ?? true;
  const windowStatus = opts?.status ?? "published";

  const venueSelect = includeOrganization
    ? "*, org:organizations ( id, name )"
    : "*";

  let venueQuery = supabase.from("venues").select(venueSelect).eq("id", venueId);

  if (opts?.orgId) {
    venueQuery = venueQuery.eq("org_id", opts.orgId);
  }

  const [{ data: venue, error: venueError }, { data: windows, error: windowsError }] =
    await Promise.all([
      venueQuery.single(),
      supabase
        .from("happy_hour_windows")
        .select("*")
        .eq("venue_id", venueId)
        .eq("status", windowStatus)
        .order("start_time", { ascending: true })
    ]);

  const typedVenue = (venue as VenueWithOrganization | null) ?? null;
  const typedWindows = (windows ?? []) as HappyHourWindow[];

  if (venueError) {
    console.error("fetchVenueWithWindows venue error:", venueError);
  }

  if (windowsError) {
    console.error("fetchVenueWithWindows windows error:", windowsError);
  }

  if (!throwOnError) {
    return {
      venue: typedVenue,
      windows: typedWindows,
      venueError,
      windowsError
    };
  }

  if (venueError) {
    throw venueError;
  }

  if (windowsError) {
    throw windowsError;
  }

  if (!typedVenue) {
    throw new Error(`Venue not found for id=${venueId}`);
  }

  return {
    venue: typedVenue,
    windows: typedWindows
  };
}

/**
 * Fetch published happy hour offers for a specific window.
 */
export async function fetchWindowOffers(
  windowId: string
): Promise<HappyHourOffer[]> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("happy_hour_offers")
    .select("*")
    .eq("window_id", windowId)
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchWindowOffers error:", error);
    throw error;
  }

  return data ?? [];
}
