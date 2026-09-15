// supabase/functions/_shared/push-gate.ts
//
// ONE place that decides which venues may trigger consumer push notifications
// (happy hour starting, event starting, happy hour published/updated).
//
// History (2026-09-14): three functions each carried their own copy of a
// featured/founding_pilot subscription check, and each used
// .neq("status","inactive") — a value venue_subscriptions.status can never
// hold — so the gate passed canceled subscriptions and, in practice, blocked
// everything else: there were zero live paid venues, so no consumer push had
// ever been sent. Meanwhile the app had 145 published happy-hour windows and
// ~93 weekly recurring events that users follow.
//
// Owner decision 2026-09-14: open consumer pushes to every published venue.
// Re-gating is a config flip, not a code change:
//
//   PUSH_GATE_MODE = "all"   (default) every published venue is eligible
//   PUSH_GATE_MODE = "paid"  only venues on a LIVE featured / founding_pilot plan
//
// Set it as an edge-function secret to switch. Unknown values fall back to
// "all" and log a warning, so a typo cannot silently silence the app again.

const LIVE_SUB_STATUSES = ["active", "trialing", "pilot"] as const;
const PAID_PLANS = ["featured", "founding_pilot"] as const;

export type PushGateMode = "all" | "paid";

export function pushGateMode(): PushGateMode {
  const raw = (Deno.env.get("PUSH_GATE_MODE") ?? "all").trim().toLowerCase();
  if (raw === "all" || raw === "paid") return raw;
  console.warn(`[push-gate] unknown PUSH_GATE_MODE="${raw}", using "all"`);
  return "all";
}

/**
 * Filters `venueIds` down to those allowed to trigger a consumer push.
 * Always excludes unpublished venues. Under "paid" additionally requires a
 * live featured / founding_pilot subscription.
 */
export async function eligibleVenueIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  venueIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(venueIds.filter(Boolean))];
  if (ids.length === 0) return new Set();

  const { data: published, error } = await supabase
    .from("venues")
    .select("id")
    .in("id", ids)
    .eq("status", "published");
  if (error) {
    console.error("[push-gate] venues lookup failed:", error.message);
    return new Set();
  }
  // deno-lint-ignore no-explicit-any
  let eligible = new Set<string>((published ?? []).map((v: any) => v.id));

  if (pushGateMode() === "paid" && eligible.size > 0) {
    const { data: subs, error: subErr } = await supabase
      .from("venue_subscriptions")
      .select("venue_id")
      .in("venue_id", [...eligible])
      .in("plan", PAID_PLANS as unknown as string[])
      .in("status", LIVE_SUB_STATUSES as unknown as string[]);
    if (subErr) {
      console.error("[push-gate] subscriptions lookup failed:", subErr.message);
      return new Set();
    }
    // deno-lint-ignore no-explicit-any
    eligible = new Set<string>((subs ?? []).map((s: any) => s.venue_id));
  }

  return eligible;
}
