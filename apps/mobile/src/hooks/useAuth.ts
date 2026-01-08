import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

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