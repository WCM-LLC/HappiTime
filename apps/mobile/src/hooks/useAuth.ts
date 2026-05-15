import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

/**
 * Subscribes to the Supabase auth state and exposes the current session.
 * Sets loading=false as soon as the initial session check OR the INITIAL_SESSION event arrives,
 * whichever comes first — prevents the app from blocking on a slow auth library init.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  let mounted = true;

  // Always end booting after first session check finishes
  (async () => {
    const { data } = await supabase.auth.getSession();
    if (!mounted) return;
    setSession(data.session ?? null);
    setLoading(false);
  })();

  const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
    if (!mounted) return;
    setSession(newSession ?? null);

    // IMPORTANT: also end booting as soon as auth library emits anything
    if (event === "INITIAL_SESSION") setLoading(false);
  });

  return () => {
    mounted = false;
    sub.subscription.unsubscribe();
  };
}, []);


  return { session, loading };
}