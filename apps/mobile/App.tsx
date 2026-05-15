import type { Session } from "@supabase/supabase-js";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "./components/ui/icon-symbol";
import LoadingView from "./src/components/LoadingView";
import { VisitRatingModal } from "./src/components/VisitRatingModal";
import { supabase } from "./src/api/supabaseClient";
import { useConfigPushNotifications } from "./src/hooks/useConfigPushNotifications";
import { useHappyHours } from "./src/hooks/useHappyHours";
import { useMagicLinkListener } from "./src/hooks/useMagicLinkListener";
import { useOnboardingStatus } from "./src/hooks/useOnboardingStatus";
import { useUserPreferences } from "./src/hooks/useUserPreferences";
import { useVisitRating } from "./src/hooks/useVisitRating";
import { useVisitTracker, type VenuePoint } from "./src/hooks/useVisitTracker";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
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

export default function App() {

  useEffect(() => {
  console.log("App mounted");
  return () => console.log("App unmounted");
}, []);

  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [guestChoice, setGuestChoice] = useState<"prompt" | "skip" | "signin">("prompt");
  const onboarding = useOnboardingStatus(session);
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

  if (!session) {
    if (guestChoice === "signin") {
      return <AuthScreen />;
    }

    if (guestChoice === "skip") {
      return <AppNavigator initialTab="Map" />;
    }

    return (
      <View style={styles.authPromptContainer}>
        <View style={styles.authPromptCard}>
          <Text style={styles.authPromptTitle}>Welcome to HappiTime</Text>
          <Text style={styles.authPromptBody}>
            Sign in to save venues, build itineraries, and interact with the community.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.authPromptPrimaryButton,
              pressed && styles.privacyButtonPressed,
            ]}
            onPress={() => setGuestChoice("signin")}
          >
            <Text style={styles.authPromptPrimaryButtonText}>Create Account / Sign In</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.authPromptSecondaryButton,
              pressed && styles.privacyButtonPressed,
            ]}
            onPress={() => setGuestChoice("skip")}
          >
            <Text style={styles.authPromptSecondaryButtonText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
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

  return <AuthenticatedApp session={session} />;
}

const styles = StyleSheet.create({
  authPromptContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  authPromptCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md,
  },
  authPromptTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  authPromptBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  authPromptPrimaryButton: {
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
  },
  authPromptPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  authPromptSecondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  authPromptSecondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
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
