// After an earned signup, replays the gated action the guest attempted
// (save / check-in) using THESE hook instances — which, mounted at the signed-in
// App root, hold the current user. This avoids the stale-closure trap (a guest-era
// closure would still see user=null and re-gate). Fires once per session.
import { useEffect, useRef } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { useUserFollowedVenues } from "./useUserFollowedVenues";
import { useCheckin } from "./useCheckin";
import { takePendingIntent } from "../lib/pendingGatedAction";

export function useGatedActionResume(): void {
  const { user } = useCurrentUser();
  const { toggleFollow } = useUserFollowedVenues();
  const { _invoke } = useCheckin();
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
    } else {
      void _invoke(intent.body);
    }
  }, [user?.id, toggleFollow, _invoke]);
}
