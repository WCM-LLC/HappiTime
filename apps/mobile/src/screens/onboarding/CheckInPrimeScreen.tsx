// apps/mobile/src/screens/onboarding/CheckInPrimeScreen.tsx
//
// Coaster onboarding (ON1 controller + ON3 card).
//
// The post-signup geofence gate, rendered as the `checkin_prime` onboarding step.
// On mount it silently decides whether this brand-new user is physically inside a
// published venue's geofence (a coaster-in-a-bar scanner):
//
//   1. Read foreground location permission WITHOUT prompting. If it wasn't granted
//      back in the "location" step, skip entirely (don't re-prompt couch users).
//   2. Get the current position once (foreground), then nearest_published_venue(250m).
//   3. Match  → show the prime card ("You're at {venue}, ask your server for the code").
//      No match / denied / error → resolve straight to the normal app.
//
// Routing only — the daily code + verify-checkin geofence still guard the actual
// check-in. The flag (checkinPrimeShown) is set the moment this resolves, match or
// not, so it never fires twice. "Check in" can't navigate here (this screen renders
// above the NavigationContainer), so it stashes the venue + the USER's coordinates
// (what verify-checkin geofences against) and lets onboarding complete; the handoff
// hook in AppNavigator opens CheckInScreen.

import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "../../../components/ui/icon-symbol";
import { supabase } from "../../api/supabaseClient";
import { hasShownCheckinPrime, markCheckinPrimeShown } from "../../lib/checkinPrimeShown";
import type { PendingCheckinPrime } from "../../lib/pendingCheckinPrime";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { ObPrimaryButton, ObSecondaryButton } from "./atoms";

const SEARCH_RADIUS_M = 250;

type NearestVenueRow = {
  venue_id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  distance_m: number;
};

export type CheckInPrimeScreenProps = {
  userId: string;
  /** Advance to the normal "complete" step (no match, denied, error, or Skip). */
  onResolveToComplete: () => void;
  /** Stash the matched venue + user coords and complete onboarding into check-in. */
  onCheckIn: (target: PendingCheckinPrime) => void;
};

export const CheckInPrimeScreen: React.FC<CheckInPrimeScreenProps> = ({
  userId,
  onResolveToComplete,
  onCheckIn,
}) => {
  const insets = useSafeAreaInsets();
  const [target, setTarget] = useState<PendingCheckinPrime | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  // The geofence probe must run exactly once even if the step re-renders.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    const resolveAway = async () => {
      await markCheckinPrimeShown(userId);
      if (!cancelled) onResolveToComplete();
    };

    void (async () => {
      try {
        // Already resolved on a prior run (e.g. app killed while the card was up,
        // with `checkin_prime` saved as the resume step) — never re-probe/re-prompt.
        if (await hasShownCheckinPrime(userId)) {
          if (!cancelled) onResolveToComplete();
          return;
        }

        // Read permission without prompting — only proceed if the "location" step
        // already granted it. Couch users (denied/undetermined) fall through here.
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          await resolveAway();
          return;
        }

        // GPS stalls indoors — exactly where coaster scanners are. Prefer the
        // recent fix captured during the "location" step (last-known), and cap a
        // fresh fetch at 8s so we never trap the user on the spinner; a timeout
        // falls through to the catch below and resolves as no-match.
        const position =
          (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ??
          (await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("location_timeout")), 8000)
            ),
          ]));
        if (cancelled) return;

        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        const { data, error } = await (supabase as any).rpc(
          "nearest_published_venue",
          { p_lat: userLat, p_lng: userLng, p_max_m: SEARCH_RADIUS_M }
        );
        if (cancelled) return;

        const match: NearestVenueRow | undefined =
          !error && Array.isArray(data) ? data[0] : undefined;

        // Mark resolved either way so the prime never fires twice on this install.
        await markCheckinPrimeShown(userId);
        if (cancelled) return;

        if (match?.venue_id) {
          // verify-checkin geofences against the USER's coordinates, not the venue's.
          setTarget({
            venueId: match.venue_id,
            venueName: match.name,
            lat: userLat,
            lng: userLng,
          });
        } else {
          onResolveToComplete();
        }
      } catch {
        // Never dead-end onboarding on a location/RPC failure — proceed to the app.
        await resolveAway();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, onResolveToComplete]);

  // Detecting (and the brief window before a no-match resolves) — neutral spinner.
  if (!target) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.detectingText}>Checking where you are…</Text>
      </View>
    );
  }

  // Matched a venue — the prime card.
  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <IconSymbol name="checkmark.seal.fill" size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>You&apos;re at {target.venueName} 🍻</Text>
        <Text style={styles.body}>
          Ask your server for today&apos;s HappiTime code to check in and start earning
          toward a free round.
        </Text>
      </View>

      <View style={styles.footer}>
        <ObPrimaryButton
          label="Check in"
          busy={checkingIn}
          onPress={() => {
            setCheckingIn(true);
            onCheckIn(target);
          }}
        />
        <ObSecondaryButton label="Skip for now" onPress={onResolveToComplete} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  detectingText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    gap: spacing.sm,
  },
});
