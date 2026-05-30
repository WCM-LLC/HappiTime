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

// Per-venue tiers (freemium model). 'listed' is the free default (was 'free').
// Org-level bundle tiers live in org_subscriptions, not here.
export type VenuePlan = "listed" | "verified" | "featured" | "founding_pilot";
export type UserPlan = "free" | "power";
export type PlanStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "paused"
  | "pilot"
  | "inactive"
  | "trial";

const ACTIVE_PLAN_STATUSES = new Set<PlanStatus>(["active", "trialing", "trial", "pilot"]);
const VENUE_PLANS = new Set<VenuePlan>(["listed", "verified", "featured", "founding_pilot"]);

/**
 * Returns the active plan for a venue.
 * Returns 'listed' (free tier) when no record exists or when status does not grant access.
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
  if (!data || !ACTIVE_PLAN_STATUSES.has(data.status as PlanStatus)) return "listed";
  return VENUE_PLANS.has(data.plan as VenuePlan) ? (data.plan as VenuePlan) : "listed";
}

/**
 * Returns the active plan for a user.
 * Returns 'free' when no record exists or when status does not grant access.
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
  if (!data || !ACTIVE_PLAN_STATUSES.has(data.status as PlanStatus)) return "free";
  return data.plan as UserPlan;
}
