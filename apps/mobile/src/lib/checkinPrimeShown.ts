// Coaster onboarding (ON4): one-time guard for the post-signup check-in prime.
//
// The prime (geofence detection → "You're at {venue}, ask your server for the
// code") must fire at most once per install, regardless of how the first run ends
// (matched + checked in, matched + skipped, no match, or location not granted).
// A durable per-user AsyncStorage flag guarantees that. Mirrors the storage-key
// style of useOnboardingStatus (`happitime:onboarding:...`) and the durable-flag
// pattern of notifPrime / prefeedOnboarded.

import AsyncStorage from "@react-native-async-storage/async-storage";

const storageKey = (userId: string) =>
  `happitime:onboarding:checkin_prime:v1:${userId}`;

/** True once the check-in prime has resolved for this user on this install. */
export async function hasShownCheckinPrime(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(storageKey(userId))) !== null;
  } catch {
    // If storage is unreadable, treat as not-yet-shown so the gate can still run;
    // worst case the prime is offered once more, never a hard failure.
    return false;
  }
}

/** Mark the prime resolved so it never appears again on this install. */
export async function markCheckinPrimeShown(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), "1");
  } catch {
    // Non-fatal: a failed write just means the prime could re-offer next run.
  }
}
