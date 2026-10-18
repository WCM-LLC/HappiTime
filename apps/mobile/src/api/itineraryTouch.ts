import { supabase } from "./supabaseClient";

/**
 * Tells the backend the signed-in user saw venues through someone's itinerary,
 * so a later verified check-in at one of them can be credited to the Insider
 * who made it (see docs/superpowers/specs/2026-10-10-super-user-checkin-influence.md).
 *
 *   recordItineraryTouch(listId)           → the itinerary was opened
 *   recordItineraryTouch(listId, venueId)  → a venue in it was tapped
 *
 * Fire-and-forget on purpose: attribution is bookkeeping and must never delay
 * or break navigation. The RPC decides everything that matters server-side —
 * it is a no-op for the caller's own lists, lists that are not an Insider's,
 * and venues that are not in the list — so callers do not pre-filter.
 */
export function recordItineraryTouch(listId: string, venueId?: string): void {
  if (!listId) return;
  void (async () => {
    try {
      // Signed-out viewers can open a shared link; the RPC requires a user.
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      // Cast: generated DB types predate this RPC (migration 20261011031500).
      await (supabase as any).rpc(
        "record_itinerary_touch",
        venueId ? { p_list_id: listId, p_venue_id: venueId } : { p_list_id: listId }
      );
    } catch {
      // Best-effort: a lost touch costs one credit, never the user's tap.
    }
  })();
}
