// One-time contextual push-notification prime. A module-level handler (set by
// App root) opens the sheet; a durable AsyncStorage flag ("ht_notif_primed")
// guarantees the prime is offered at most once per install. Mirrors gatedAction
// (handler) + prefeedOnboarded (durable flag).
import AsyncStorage from "@react-native-async-storage/async-storage";

const FLAG = "ht_notif_primed";

type NotifPrimeHandler = () => void;
let handler: NotifPrimeHandler | null = null;

export function setNotifPrimeHandler(fn: NotifPrimeHandler | null): void {
  handler = fn;
}

/** Opens the prime sheet immediately (no durability check). Returns false if no handler. */
export function requestNotifPrime(): boolean {
  if (!handler) return false;
  handler();
  return true;
}

/** Fire-and-forget: open the prime once ever. Marks primed so it never repeats. */
export async function maybeRequestNotifPrime(): Promise<void> {
  const already = await AsyncStorage.getItem(FLAG);
  if (already) return;
  if (requestNotifPrime()) {
    await AsyncStorage.setItem(FLAG, "1");
  }
}

/** Marks primed without showing (e.g., if the user already granted elsewhere). */
export async function markNotifPrimed(): Promise<void> {
  await AsyncStorage.setItem(FLAG, "1");
}
