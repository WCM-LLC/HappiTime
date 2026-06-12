// After signup, drains the durable guest-selection stash (vibes the guest
// picked before having an account) into user_preferences.interests, using THIS
// hook's instance — mounted at the signed-in App root, so savePreferences has
// the current user. Fires once per sign-in; clears the stash on apply so it
// never re-runs. Hood is intentionally NOT persisted (no neighborhood column;
// see the Phase 3 plan's Scope note) — it stays a guest-local feed signal.
import { useEffect, useRef } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { useUserPreferences } from "./useUserPreferences";
import { takeGuestSelections } from "../lib/guestSelections";
import { vibesToTagSlugs } from "../lib/vibeTagMap";

export function useGuestSelectionPersist(): void {
  const { user } = useCurrentUser();
  const { savePreferences } = useUserPreferences();
  const done = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      done.current = false; // reset for the next sign-in
      return;
    }
    if (done.current) return;
    done.current = true; // claim synchronously so the async read fires once

    let cancelled = false;
    void (async () => {
      const sel = await takeGuestSelections();
      if (cancelled || !sel) return;
      const interests = vibesToTagSlugs(sel.vibes);
      if (interests.length === 0) return;
      await savePreferences({ interests });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, savePreferences]);
}
