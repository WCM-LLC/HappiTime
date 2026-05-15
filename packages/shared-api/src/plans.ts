// packages/shared-api/src/plans.ts
//
// Fail-open plan helpers.  A missing record → 'free'.
// These are lookup-only — no gating or enforcement happens here.
//
// Explicitly FREE for all users regardless of plan (never gate these):
//   • Shared / public itineraries (is_shared: true)
//   • Group check-in

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@happitime/shared-types";
import { createSupabaseClient } from "./client.js";

export type VenuePlan = "free" | "pro" | "business";
export type UserPlan = "free" | "power";
export type PlanStatus = "active" | "inactive" | "trial";

/**
 * Returns the active plan for a venue.
 * Returns 'free' when no record exists or when status is 'inactive'.
 */
export async function getVenuePlan(
  venueId: string,
  supabase?: SupabaseClient<Database>
): Promise<VenuePlan> {
  const client = supabase ?? createSupabaseClient();
  const { data } = await client
    .from("venue_subscriptions")
    .select("plan, status")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (!data || data.status === "inactive") return "free";
  return data.plan as VenuePlan;
}

/**
 * Returns the active plan for a user.
 * Returns 'free' when no record exists or when status is 'inactive'.
 */
export async function getUserPlan(
  userId: string,
  supabase?: SupabaseClient<Database>
): Promise<UserPlan> {
  const client = supabase ?? createSupabaseClient();
  const { data } = await client
    .from("user_plans")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.status === "inactive") return "free";
  return data.plan as UserPlan;
}
