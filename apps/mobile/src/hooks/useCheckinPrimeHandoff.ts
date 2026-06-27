// src/hooks/useCheckinPrimeHandoff.ts
//
// Coaster onboarding (ON3): consumes the check-in target stashed during the
// onboarding check-in prime and routes into the live CheckInScreen once the
// navigator is mounted.
//
// The prime step runs inside OnboardingScreen, which renders ABOVE the
// NavigationContainer — so it can't navigate("CheckIn") itself. Instead it stashes
// the matched venue (pendingCheckinPrime) and completes onboarding; this hook,
// mounted in AppNavigator alongside useVenueDeepLink, picks the stash up after the
// navigator is ready and pushes CheckIn with fromOnboarding: true.
//
// Mirrors useVenueDeepLink's waitForNav + consume-once shape. Display/routing only:
// no check-in logic runs here — CheckInScreen + verify-checkin do the rest.

import { useEffect } from "react";
import { takePendingCheckinPrime } from "../lib/pendingCheckinPrime";

// The navigator may still be mounting (we just left the onboarding gate, possibly
// via the PostSignupCapture handle screen). Poll isReady briefly so the stashed
// target isn't dropped.
async function waitForNav(
  navigationRef: React.RefObject<any>,
  timeoutMs = 5000,
): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const nav = navigationRef.current;
    if (nav?.isReady?.()) return nav;
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 100));
  }
  return null;
}

export function useCheckinPrimeHandoff(navigationRef: React.RefObject<any>) {
  useEffect(() => {
    let cancelled = false;

    const target = takePendingCheckinPrime();
    if (!target) return;

    void (async () => {
      const nav = await waitForNav(navigationRef);
      if (cancelled || !nav) return;
      nav.navigate("CheckIn", {
        venueId: target.venueId,
        venueName: target.venueName,
        lat: target.lat,
        lng: target.lng,
        fromOnboarding: true,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigationRef]);
}
