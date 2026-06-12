import type { Session } from "@supabase/supabase-js";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { IconSymbol } from "./components/ui/icon-symbol";
import LoadingView from "./src/components/LoadingView";
import { VisitRatingModal } from "./src/components/VisitRatingModal";
import { supabase } from "./src/api/supabaseClient";
import { isPromotedTier } from "./src/lib/venueTier";
import { useConfigPushNotifications } from "./src/hooks/useConfigPushNotifications";
import { useHappyHours } from "./src/hooks/useHappyHours";
import { useMagicLinkListener } from "./src/hooks/useMagicLinkListener";
import { useOnboardingStatus } from "./src/hooks/useOnboardingStatus";
import { useReferralCapture } from "./src/hooks/useReferralCapture";
import { useVenueLinkCapture } from "./src/hooks/useVenueLinkCapture";
import { useUserPreferences } from "./src/hooks/useUserPreferences";
import { useVisitRating } from "./src/hooks/useVisitRating";
import { useVisitTracker, type VenuePoint } from "./src/hooks/useVisitTracker";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthScreen } from "./src/screens/AuthScreen";
import { PreFeedOnboarding } from "./src/screens/onboarding/PreFeedOnboarding";
import { usePrefeedOnboarded } from "./src/lib/prefeedOnboarded";
import { HandleGateScreen } from "./src/screens/HandleGateScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { EarnedSignupSheet } from "./src/components/EarnedSignupSheet";
import { setSignInRequestHandler, type GatedActionKind } from "./src/lib/gatedAction";
import { colors } from "./src/theme/colors";
import { spacing } from "./src/theme/spacing";

function AuthenticatedApp({ session }: { session: Session }) {
  useConfigPushNotifications(session);
  const { preferences, loading: preferencesLoading } = useUserPreferences();

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
          isPremium: isPromotedTier(venue.promotion_tier),
          timezone: (window as any).timezone ?? undefined,
          happyHourWindows: [windowSlice],
          serverRatingPromptsEnabled: (venue as any).post_visit_rating_enabled ?? true,
        });
      }
    }
    return Array.from(seen.values());
  }, [happyHours]);

  const { startTracking, stopTracking, setOnVisitDetected } = useVisitTracker(venues);
  const [showCheckinPrivacyPrompt, setShowCheckinPrivacyPrompt] = useState(false);
  const [checkinPrivacySaving, setCheckinPrivacySaving] = useState(false);
  const [checkinPrivacyError, setCheckinPrivacyError] = useState<string | null>(null);

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
      setCheckinPrivacyError(null);
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
      setCheckinPrivacySaving(true);
      setCheckinPrivacyError(null);
      const { error } = await (supabase as any)
        .from("user_preferences")
        .upsert({ user_id: userId, default_checkin_privacy: value }, { onConflict: "user_id" });
      setCheckinPrivacySaving(false);

      if (error) {
        setCheckinPrivacyError("Could not save that choice. Please try again.");
        return;
      }

      setShowCheckinPrivacyPrompt(false);
    },
    [session?.user?.id]
  );

  // Start location tracking only after the user opts into location-powered features.
  useEffect(() => {
    if (preferencesLoading) return;
    if (preferences.location_enabled && venues.length > 0) {
      void startTracking();
    } else {
      void stopTracking();
    }
  }, [
    preferences.location_enabled,
    preferencesLoading,
    venues.length,
    startTracking,
    stopTracking,
  ]);

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
        <View style={styles.privacyBackdrop}>
          <View style={styles.privacyCard}>
            <View style={styles.privacyIcon}>
              <IconSymbol name="checkmark.seal.fill" size={24} color={colors.primary} />
            </View>
            <Text style={styles.privacyTitle}>Check-in privacy</Text>
            <Text style={styles.privacyBody}>
              Pick how automatic check-ins should appear. You can still change each check-in later.
            </Text>
            {checkinPrivacyError ? (
              <Text style={styles.privacyError}>{checkinPrivacyError}</Text>
            ) : null}
            <Pressable
              disabled={checkinPrivacySaving}
              style={({ pressed }) => [
                styles.privacyPrimaryButton,
                pressed && !checkinPrivacySaving && styles.privacyButtonPressed,
                checkinPrivacySaving && styles.privacyButtonDisabled,
              ]}
              onPress={() => void saveDefaultCheckinPrivacy("friends")}
            >
              <Text style={styles.privacyPrimaryButtonText}>Share with friends</Text>
              <Text style={styles.privacyPrimaryButtonSubtext}>Your friends can see where you checked in.</Text>
            </Pressable>
            <Pressable
              disabled={checkinPrivacySaving}
              style={({ pressed }) => [
                styles.privacySecondaryButton,
                pressed && !checkinPrivacySaving && styles.privacyButtonPressed,
                checkinPrivacySaving && styles.privacyButtonDisabled,
              ]}
              onPress={() => void saveDefaultCheckinPrivacy("private")}
            >
              <Text style={styles.privacySecondaryButtonText}>Keep private</Text>
              <Text style={styles.privacySecondaryButtonSubtext}>Only you can see automatic check-ins.</Text>
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

function AppRoot() {

  useEffect(() => {
  console.log("App mounted");
  return () => console.log("App unmounted");
}, []);

  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [signupKind, setSignupKind] = useState<GatedActionKind | null>(null);
  const [guestChoice, setGuestChoice] = useState<"prompt" | "skip" | "signin">("prompt");
  const [handleGate, setHandleGate] = useState<"checking" | "needed" | "satisfied">("checking");
  const onboarding = useOnboardingStatus(session);
  const prefeed = usePrefeedOnboarded();
  useMagicLinkListener();

  // A scanned venue QR must route even before the user is past the auth/welcome
  // gate (QR codes target new users). Capture it above the gate and leave the
  // gate into guest mode; AppNavigator's useVenueDeepLink then opens the venue.
  const enterGuestForVenueScan = useCallback(
    () => setGuestChoice((choice) => (choice === "prompt" ? "skip" : choice)),
    [],
  );
  useVenueLinkCapture(enterGuestForVenueScan);
  useReferralCapture();

  // Register the module-level earned-signup handler so gated hooks can open the sheet.
  useEffect(() => {
    setSignInRequestHandler((kind) => setSignupKind(kind));
    return () => setSignInRequestHandler(null);
  }, []);

  // Auto-close the earned-signup sheet when a session arrives.
  useEffect(() => {
    if (session) setSignupKind(null);
  }, [session]);

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

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || onboarding.loading || !onboarding.hasCompletedOnboarding) {
      if (!session || (!onboarding.loading && !onboarding.hasCompletedOnboarding)) {
        setHandleGate("checking");
      }
      return;
    }
    void (async () => {
      const { data } = await (supabase as any)
        .from("user_profiles")
        .select("handle")
        .eq("user_id", userId)
        .maybeSingle();
      const existingHandle = data?.handle;
      setHandleGate(existingHandle && String(existingHandle).trim().length > 0 ? "satisfied" : "needed");
    })();
  }, [session?.user?.id, onboarding.loading, onboarding.hasCompletedOnboarding]);

  if (booting) {
    console.log("booting:", booting, "session:", !!session);
    return <LoadingView message={"Restoring session..."} />;
  }

  if (!session) {
    if (guestChoice === "signin") {
      return <AuthScreen />;
    }

    if (guestChoice === "skip") {
      return (
        <>
          <AppNavigator initialTab="Map" />
          <EarnedSignupSheet kind={signupKind} onDismiss={() => setSignupKind(null)} />
        </>
      );
    }

    // guestChoice === "prompt": behavior-first pre-feed onboarding (shown once).
    // Replaces the old Welcome/Create-Account card — signup is now earned (Phase 2).
    if (prefeed.loading) {
      return <LoadingView message={""} />;
    }
    if (!prefeed.seen) {
      return (
        <PreFeedOnboarding
          onDone={async () => {
            // Guest selections are local-only in Phase 1; persistence is Phase 3.
            // Enter guest browse even if the flag write fails (worst case: re-show next launch).
            try {
              await prefeed.markSeen();
            } finally {
              setGuestChoice("skip");
            }
          }}
        />
      );
    }
    // Already saw the pre-feed flow but still no account → straight to guest browse.
    return (
      <>
        <AppNavigator initialTab="Map" />
        <EarnedSignupSheet kind={signupKind} onDismiss={() => setSignupKind(null)} />
      </>
    );
  }

  if (onboarding.loading) {
    return <LoadingView message={"Checking account setup..."} />;
  }

  if (!onboarding.hasCompletedOnboarding) {
    return (
      <OnboardingScreen
        session={session}
        initialStep={onboarding.step}
        onProgress={onboarding.saveProgress}
        onComplete={onboarding.completeOnboarding}
      />
    );
  }

  if (handleGate === "checking") {
    return <LoadingView message={"Setting up account..."} />;
  }

  if (handleGate === "needed") {
    return (
      <HandleGateScreen
        session={session}
        onComplete={() => setHandleGate("satisfied")}
      />
    );
  }

  return <AuthenticatedApp session={session} />;
}

const styles = StyleSheet.create({
  privacyBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(26, 26, 26, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  privacyCard: {
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    maxWidth: 380,
    padding: spacing.xl,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 1,
    shadowRadius: 32,
    width: "100%",
  },
  privacyIcon: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.brandSubtle,
    borderColor: colors.brandLight,
    borderRadius: 18,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    marginBottom: spacing.xs,
    width: 56,
  },
  privacyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  privacyBody: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  privacyError: {
    backgroundColor: colors.errorLight,
    borderColor: colors.error,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlign: "center",
  },
  privacyPrimaryButton: {
    backgroundColor: colors.text,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  privacyPrimaryButtonText: {
    color: colors.pillActiveText,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  privacyPrimaryButtonSubtext: {
    color: colors.darkMuted,
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
  privacySecondaryButton: {
    backgroundColor: colors.brandSubtle,
    borderColor: colors.brandLight,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  privacySecondaryButtonText: {
    color: colors.brandDark,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  privacySecondaryButtonSubtext: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
  privacyButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  privacyButtonDisabled: {
    opacity: 0.62,
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}
