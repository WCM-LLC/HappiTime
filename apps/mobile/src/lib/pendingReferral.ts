// Durable (AsyncStorage) stash for an Insider referral handle captured BEFORE
// sign-in. Survives app restarts so a guest's attribution is preserved until
// they eventually create an account. FIRST-WINS: never overwrite an existing stash.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeReferralHandle } from "./referralHandle";

const KEY = "ht_pending_referral";

/** Stash a referral handle (first-wins — does nothing if one is already stored). */
export async function setPendingReferral(handle: string): Promise<void> {
  const norm = normalizeReferralHandle(handle);
  if (!norm) return;
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return; // first-wins: honor the originator
  await AsyncStorage.setItem(KEY, norm);
}

/** Read without clearing (for pre-filling the post-signup step in Phase 2). */
export async function peekPendingReferral(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

/** Read and clear (consume on successful attribution). */
export async function takePendingReferral(): Promise<string | null> {
  const v = await AsyncStorage.getItem(KEY);
  if (v) await AsyncStorage.removeItem(KEY);
  return v;
}
