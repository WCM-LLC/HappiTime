// packages/shared-api/src/venues.ts

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Venue } from "@happitime/shared-types";

export type VenueSummary = Pick<
  Venue,
  "id" | "name" | "org_name" | "city" | "state" | "status"
>;

export type VenueDetail = Pick<
  Venue,
  | "id"
  | "org_id"
  | "name"
  | "org_name"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "timezone"
  | "phone"
  | "website"
  | "facebook_url"
  | "instagram_url"
  | "tiktok_url"
  | "app_name_preference"
  | "cuisine_type"
  | "status"
>;

export async function fetchVenuesByOrg(
  supabase: SupabaseClient<Database>,
  orgId: string,
  opts?: { order?: { column: string; ascending?: boolean } }
): Promise<{ data: VenueSummary[]; error: PostgrestError | null }> {
  const order = opts?.order ?? { column: "created_at", ascending: false };
  const { data, error } = await supabase
    .from("venues")
    .select("id,name,org_name,city,state,status")
    .eq("org_id", orgId)
    .order(order.column, { ascending: order.ascending ?? false });

  return { data: (data ?? []) as VenueSummary[], error };
}

export async function fetchVenueById(
  supabase: SupabaseClient<Database>,
  venueId: string,
  opts?: { orgId?: string }
): Promise<{ data: VenueDetail | null; error: PostgrestError | null }> {
  let query = supabase
    .from("venues")
    .select(
      "id,org_id,name,org_name,address,city,state,zip,timezone,phone,website,facebook_url,instagram_url,tiktok_url,app_name_preference,cuisine_type,status"
    )
    .eq("id", venueId);

  if (opts?.orgId) {
    query = query.eq("org_id", opts.orgId);
  }

  const { data, error } = await query.single();
  return { data: (data ?? null) as VenueDetail | null, error };
}

export async function fetchVenueNamesByIds(
  supabase: SupabaseClient<Database>,
  venueIds: string[]
): Promise<{ data: { id: string; name: string }[]; error: PostgrestError | null }> {
  if (!venueIds.length) return { data: [], error: null };

  const { data, error } = await supabase
    .from("venues")
    .select("id,name")
    .in("id", venueIds);

  return { data: (data ?? []) as { id: string; name: string }[], error };
}
