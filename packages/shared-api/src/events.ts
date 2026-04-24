// packages/shared-api/src/events.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, VenueEvent } from "@happitime/shared-types";
import { createSupabaseClient } from "./client.js";

export type VenueEventWithVenue = VenueEvent & {
  venue_name: string | null;
  venue_slug: string | null;
  venue_address: string | null;
  venue_neighborhood: string | null;
  venue_city: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
};

/**
 * Fetch published upcoming events for a specific venue.
 */
export async function fetchVenueEvents(
  venueId: string,
  opts?: { supabase?: SupabaseClient<Database>; limit?: number }
): Promise<VenueEvent[]> {
  const supabase = opts?.supabase ?? createSupabaseClient();

  // Fetch upcoming one-off events OR any recurring event (regardless of start date)
  let query = supabase
    .from("venue_events")
    .select("*")
    .eq("venue_id", venueId)
    .eq("status", "published")
    .or(`starts_at.gte.${new Date().toISOString()},is_recurring.eq.true`)
    .order("starts_at", { ascending: true });

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchVenueEvents error:", error);
    throw error;
  }

  return (data ?? []) as VenueEvent[];
}

/**
 * Fetch all published upcoming events across all venues.
 */
export async function fetchUpcomingEvents(opts?: {
  supabase?: SupabaseClient<Database>;
  limit?: number;
}): Promise<VenueEventWithVenue[]> {
  const supabase = opts?.supabase ?? createSupabaseClient();

  // Use the upcoming_events view
  let query = supabase
    .from("upcoming_events")
    .select("*")
    .order("starts_at", { ascending: true });

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchUpcomingEvents error:", error);
    throw error;
  }

  return (data ?? []) as VenueEventWithVenue[];
}

/**
 * Fetch approved tags, optionally filtered by category.
 */
export async function fetchApprovedTags(opts?: {
  supabase?: SupabaseClient<Database>;
  category?: string;
}) {
  const supabase = opts?.supabase ?? createSupabaseClient();

  let query = supabase
    .from("approved_tags")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("sort_order");

  if (opts?.category) {
    query = query.eq("category", opts.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchApprovedTags error:", error);
    throw error;
  }

  return data ?? [];
}
