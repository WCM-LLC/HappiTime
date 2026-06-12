// After an earned signup, replays the SAVE a guest attempted, using THIS hook's
// instance — which, mounted at the signed-in App root, holds the current user.
// This avoids the stale-closure trap (a guest-era closure would still see
// user=null and re-gate). Fires once per sign-in.
//
// Check-in is deliberately not replayed (see pendingGatedAction.ts): the user
// re-taps on the now-signed-in check-in screen with fresh geo + stamp feedback.
import { useEffect, useRef } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { useUserFollowedVenues } from "./useUserFollowedVenues";
import { takePendingIntent } from "../lib/pendingGatedAction";

export function useGatedActionResume(): void {
  const { user } = useCurrentUser();
  const { toggleFollow } = useUserFollowedVenues();
  const done = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      done.current = false; // reset for the next sign-in
      return;
    }
    if (done.current) return;
    const intent = takePendingIntent();
    if (!intent) return;
    done.current = true;
    if (intent.kind === "save") {
      void toggleFollow(intent.venueId);
    }
  }, [user?.id, toggleFollow]);
}
