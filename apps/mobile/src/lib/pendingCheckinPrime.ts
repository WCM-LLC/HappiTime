// Coaster onboarding (ON3): module-level stash for a check-in target captured
// during onboarding, BEFORE the navigator is mounted.
//
// OnboardingScreen renders ABOVE the NavigationContainer (App.tsx), so the
// check-in prime step cannot navigate("CheckIn") itself — that route only exists
// inside AppNavigator, which mounts after onboarding completes. When the user taps
// "Check in" on the prime card we stash the matched venue here, then complete
// onboarding; once AppNavigator mounts, useCheckinPrimeHandoff consumes the stash
// and routes into the live CheckInScreen.
//
// Exactly mirrors pendingVenueLink (set synchronously before the unmount, consumed
// once on the other side of the gate). In-memory is sufficient: the gate transition
// is a React re-render in the same JS runtime, not a reload.

export type PendingCheckinPrime = {
  venueId: string;
  venueName: string;
  lat: number;
  lng: number;
};

let pending: PendingCheckinPrime | null = null;

/** Stash a matched venue to route into check-in once the navigator is mounted. */
export function setPendingCheckinPrime(target: PendingCheckinPrime): void {
  pending = target;
}

/** Return and clear the stashed check-in target (null if none). */
export function takePendingCheckinPrime(): PendingCheckinPrime | null {
  const target = pending;
  pending = null;
  return target;
}
