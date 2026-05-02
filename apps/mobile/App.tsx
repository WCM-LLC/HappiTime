import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
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

  // Build venue points from happy hour data.
  // Each venue aggregates all its happy hour windows so the visit tracker can
  // check whether a happy hour is currently active when deciding to ping the user.
  const venues: VenuePoint[] = useMemo(() => {
    const seen = new Map<string, VenuePoint>();
    for (const window of happyHours) {
      const venue = window.venue;
      if (!venue?.id || !venue.lat || !venue.lng) continue;

      const windowSlice = {
        dow: (window.dow ?? []).map(Number),
        start_time: window.start_time ?? "",
        end_time: window.end_time ?? "",
      };

      if (seen.has(venue.id)) {
        seen.get(venue.id)!.happyHourWindows!.push(windowSlice);
      } else {
        seen.set(venue.id, {
          id: venue.id,
          name: venue.name ?? window.venue_name ?? "Venue",
          lat: venue.lat,
          lng: venue.lng,
          isPremium:
            venue.promotion_tier === "premium" || venue.promotion_tier === "featured",
          timezone: (window as any).timezone ?? undefined,
          happyHourWindows: [windowSlice],
          serverRatingPromptsEnabled: (venue as any).post_visit_rating_enabled ?? true,
        });
      }
    }
    return Array.from(seen.values());
  }, [happyHours]);

  const { startTracking, setOnVisitDetected } = useVisitTracker(venues);
  const [showCheckinPrivacyPrompt, setShowCheckinPrivacyPrompt] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadPreference = async () => {
      const userId = session?.user?.id;
      if (!userId) return;
      const { data } = await (supabase as any)
        .from("user_preferences")
        .select("default_checkin_privacy")
        .eq("user_id", userId)
        .maybeSingle();
      if (!mounted) return;
      const value = data?.default_checkin_privacy;
      setShowCheckinPrivacyPrompt(value !== "private" && value !== "friends");
    };
    void loadPreference();
    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  const saveDefaultCheckinPrivacy = useCallback(
    async (value: "private" | "friends") => {
      const userId = session?.user?.id;
      if (!userId) return;
      await (supabase as any)
        .from("user_preferences")
        .upsert({ user_id: userId, default_checkin_privacy: value }, { onConflict: "user_id" });
      setShowCheckinPrivacyPrompt(false);
    },
    [session?.user?.id]
  );

  // Start tracking when we have venues
  useEffect(() => {
    if (venues.length > 0) {
      void startTracking();
    }
  }, [venues.length, startTracking]);

  // Wire visit detection to rating flow
  useEffect(() => {
    setOnVisitDetected((venueId: string, venueName: string, visitId?: string) => {
      triggerRating(venueId, venueName, visitId, [], "client");
    });
  }, [setOnVisitDetected, triggerRating]);

  return (
    <>
      <AppNavigator />
      <Modal transparent visible={showCheckinPrivacyPrompt} animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View style={{ backgroundColor: "white", borderRadius: 16, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>Check-in privacy</Text>
            <Text style={{ fontSize: 15, lineHeight: 20 }}>
              Choose your default: share check-ins with friends, or keep check-ins private.
            </Text>
            <Pressable
              onPress={() => void saveDefaultCheckinPrivacy("friends")}
              style={{ backgroundColor: "#4F46E5", borderRadius: 12, padding: 12 }}
            >
              <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>
                Share my check-ins with friends
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void saveDefaultCheckinPrivacy("private")}
              style={{ backgroundColor: "#111827", borderRadius: 12, padding: 12 }}
            >
              <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>
                Keep my check-ins private
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        // Stale / revoked refresh token — clear it from AsyncStorage so the
        // "Invalid Refresh Token" error doesn't repeat on the next cold start.
        void supabase.auth.signOut({ scope: "local" });
      }
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
