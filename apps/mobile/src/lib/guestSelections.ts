// Durable (AsyncStorage) stash for the guest's pre-feed selections, so they
// survive app restarts: the guest feed reads them to seed its filter (peek),
// and the first authenticated session drains them into user_preferences (take).
// LAST-WINS — re-running the pre-feed flow overwrites the previous selection.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type GuestSelections = { hood: string | null; vibes: string[] };

const KEY = "ht_guest_selections";

export async function setGuestSelections(sel: GuestSelections): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(sel));
}

function parse(raw: string | null): GuestSelections | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && Array.isArray(v.vibes)) {
      return {
        hood: typeof v.hood === "string" ? v.hood : null,
        vibes: v.vibes.filter((x: unknown): x is string => typeof x === "string"),
      };
    }
  } catch {
    // corrupt value — treat as absent
  }
  return null;
}

/** Read without clearing (the guest feed seeds its filter from this every load). */
export async function peekGuestSelections(): Promise<GuestSelections | null> {
  return parse(await AsyncStorage.getItem(KEY));
}

/** Read and clear (consume once, on the first authenticated session). */
export async function takeGuestSelections(): Promise<GuestSelections | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) await AsyncStorage.removeItem(KEY);
  return parse(raw);
}

export async function clearGuestSelections(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
