// Durable (AsyncStorage) stash for the SAVE a guest attempted before signing in,
// so it can be replayed after the earned signup via a FRESH, signed-in hook
// instance — not a stale guest-era closure (which would still see user=null and
// re-gate). Persisting to AsyncStorage means the intent survives a COLD START:
// the email magic-link flow can relaunch the app, which would evaporate an
// in-memory variable. LAST-WINS — the guest's most recent save tap is what they
// were trying to do (unlike the first-wins referral stash, which honors the
// originator).
//
// Check-in is intentionally NOT replayed here: a check-in's payoff is the on-screen
// stamp result, and its lat/lng/code can go stale across the magic-link round-trip.
// After signup the user lands back on the (now signed-in) check-in screen and
// re-taps with fresh geo + live feedback.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type GatedIntent = { kind: "save"; venueId: string };

const KEY = "ht_pending_gated_action";

/** Stash the save intent (last-wins — overwrites any earlier pending save). */
export async function setPendingIntent(intent: GatedIntent): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(intent));
}

/** Read and clear the pending intent (null if none or if the stored value is corrupt). */
export async function takePendingIntent(): Promise<GatedIntent | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(KEY); // clear first so a corrupt value can't get stuck
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kind === "save" && typeof parsed.venueId === "string") {
      return parsed as GatedIntent;
    }
  } catch {
    // corrupt JSON — already removed above; fall through to null
  }
  return null;
}

export async function clearPendingIntent(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
