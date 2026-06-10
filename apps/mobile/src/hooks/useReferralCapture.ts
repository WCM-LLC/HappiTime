// src/hooks/useReferralCapture.ts
//
// Resolves a stashed Insider referral handle on the first signed-in session.
// Mounted at the App root alongside useVenueLinkCapture. Calls the idempotent
// record_referral RPC (first-wins; subsequent calls for the same user are
// no-ops at the DB level). No-ops when there is no signed-in user or nothing
// stashed.

import { useEffect, useRef } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { takePendingReferral } from "../lib/pendingReferral";

export function useReferralCapture(): void {
  const { user } = useCurrentUser();
  const done = useRef(false);

  useEffect(() => {
    if (!user || done.current) return;
    const handle = takePendingReferral();
    if (!handle) return;
    done.current = true;
    void (supabase as any).rpc("record_referral", {
      p_referrer_handle: handle,
      p_source: "code",
    });
  }, [user]);
}
