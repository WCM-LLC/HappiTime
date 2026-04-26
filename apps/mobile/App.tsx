import React, { useEffect, useMemo, useState } from "react";
import LoadingView from "./src/components/LoadingView";
import { VisitRatingModal } from "./src/components/VisitRatingModal";
import { supabase } from "./src/api/supabaseClient";
import { useConfigPushNotifications } from "./src/hooks/useConfigPushNotifications";
import { useHappyHours } from "./src/hooks/useHappyHours";
import { useMagicLinkListener } from "./src/hooks/useMagicLinkListener";
import { useVisitRating } from "./src/hooks/useVisitRating";
import { useVisitTracker, type VenuePoint } from "./src/hooks/useVisitTracker";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthScreen } from "./src/screens/AuthScreen";

function AuthenticatedApp({ session }: { session: any }) {
  useConfigPushNotifications(session);

  const { data: happyHours } = useHappyHours();
  const { pendingVisit, submitRating, dismissRating, submitting, triggerRating } =
    useVisitRating();

  // Build venue points from happy hour data
  const venues: VenuePoint[] = useMemo(() => {
    const seen = new Set<string>();
    const result: VenuePoint[] = [];
    for (const window of happyHours) {
      const venue = window.venue;
      if (!venue?.id || !venue.lat || !venue.lng) continue;
      if (seen.has(venue.id)) continue;
      seen.add(venue.id);
      result.push({
        id: venue.id,
        name: venue.name ?? window.venue_name ?? "Venue",
        lat: venue.lat,
        lng: venue.lng,
      });
    }
    return result;
  }, [happyHours]);

  const { startTracking, setOnVisitDetected } = useVisitTracker(venues);

  // Start tracking when we have venues
  useEffect(() => {
    if (venues.length > 0) {
      void startTracking();
    }
  }, [venues.length, startTracking]);

  // Wire visit detection to rating flow
  useEffect(() => {
    setOnVisitDetected((venueId: string, venueName: string) => {
      triggerRating(venueId, venueName);
    });
  }, [setOnVisitDetected, triggerRating]);

  return (
    <>
      <AppNavigator />
      <VisitRatingModal
        pendingVisit={pendingVisit}
        submitting={submitting}
        onSubmit={submitRating}
        onDismiss={dismissRating}
      />
    </>
  );
}

export default function App() {

  useEffect(() => {
  console.log("App mounted");
  return () => console.log("App unmounted");
}, []);

  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<any>(null);
  useMagicLinkListener();
  console.log("App render");

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session ?? null);
      setBooting(false);
    });

const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
  if (!isMounted) return;
  console.log("Auth change:", event, "session?", !!newSession);
  setSession(newSession ?? null);

  if (event === "INITIAL_SESSION") setBooting(false);
});

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (booting) {
    console.log("booting:", booting, "session:", !!session);
    return <LoadingView message={"Restoring session..."} />;
  }

  if (!session) return <AuthScreen />;

  return <AuthenticatedApp session={session} />;
}
