// supabase/functions/_shared/presence-visit.ts
//
// Bridge from the check-in write path into public.venue_visits — the ONLY
// table the mobile "Check Ins" tab reads (apps/mobile/src/hooks/useUserCheckins.ts).
// Without this, a code check-in (verify-checkin -> public.checkins) succeeds
// while the user's Check Ins tab stays empty.
//
// Sole caller: verify-checkin, which has already authenticated the user. The
// former second caller (track-visit, for the "I'm here" tap) was removed
// 2026-09-14 along with the tap itself; track-visit is anonymous attribution
// only and never writes venue_visits.
//
// Pure helpers are mirrored in test/presence-visit.test.mjs — keep in sync.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Mirrors the mobile default (useVisitTracker._defaultCheckinPrivacy): a visit
 * is private unless the user opted into 'public' or 'friends' visibility.
 * 'friends' still needs is_private=false — friend visibility is enforced by the
 * venue_visits_friends_select RLS policy, not by this flag alone.
 */
export function presenceVisitIsPrivate(pref: string | null | undefined): boolean {
  return !(pref === "public" || pref === "friends");
}

/**
 * Insert the venue_visits row for an authenticated check-in. Runs on the
 * service-role client; RLS is bypassed but the table triggers still fire:
 *  - trg_venue_visit_cooldown (3h) silently drops the row (no error, zero rows
 *    back from .select) — reported as "skipped", never as a failure.
 *  - venue_visits_sync_user_event mirrors the row into user_events.
 * Never throws: callers treat this as non-critical and must not fail their
 * primary write because the bridge hiccuped.
 */
export async function recordPresenceVisit(
  supabase: SupabaseClient<any>,
  args: { userId: string; venueId: string },
): Promise<"recorded" | "skipped" | "error"> {
  try {
    // limit(1) + [0] rather than maybeSingle() — same PGRST116 caveat as the
    // venue lookup in track-visit/index.ts.
    const { data: prefRows } = await supabase
      .from("user_preferences")
      .select("default_checkin_privacy")
      .eq("user_id", args.userId)
      .limit(1);
    const pref =
      (prefRows as Array<{ default_checkin_privacy: string | null }> | null)?.[0]
        ?.default_checkin_privacy ?? null;

    const { data, error } = await supabase
      .from("venue_visits")
      .insert({
        user_id: args.userId,
        venue_id: args.venueId,
        source: "app_checkin",
        is_private: presenceVisitIsPrivate(pref),
      })
      .select("id");

    if (error) {
      console.error("[presence-visit] venue_visits insert failed:", error.message);
      return "error";
    }
    return (data?.length ?? 0) > 0 ? "recorded" : "skipped";
  } catch (err) {
    console.error(
      "[presence-visit] unexpected failure:",
      err instanceof Error ? err.message : err,
    );
    return "error";
  }
}
