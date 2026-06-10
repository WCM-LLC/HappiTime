// src/screens/CheckInScreen.tsx
//
// Pilot loyalty check-in screen.
//
// Flow:
//  1. User enters a 4-character code given by their server.
//  2. Code is verified against verify-checkin edge function (geofenced + code-matched).
//  3. On success: stamp progress card ("3 of 5 — house buys your next round")
//     with a live ticking clock (anti-screenshot measure).
//  4. On bad_code: error inline, after 2 failures a GPS-fallback link appears.
//  5. Other failures (out_of_range, network_cap, etc.) show specific messages.
//
// Navigation params: { venueId, venueName, lat, lng }
// On success with stamps === 5: navigates to RoundRedemptionScreen.
//
// NOTE: Today's published offers are not shown on this screen (flagged as
// out-of-scope — requires wiring HappyHourCard + live HH data fetch by venue,
// which adds significant scope for marginal benefit in the loyalty flow).

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useCheckin } from "../hooks/useCheckin";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = NativeStackScreenProps<RootStackParamList, "CheckIn">;

// Fallback is offered after this many consecutive bad-code attempts
const FALLBACK_OFFER_AFTER = 2;
const STAMPS_PER_ROUND = 5;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export const CheckInScreen: React.FC<Props> = ({ route, navigation }) => {
  const { venueId, venueName, lat, lng } = route.params;
  const insets = useSafeAreaInsets();

  const { state, failCount, submit, submitFallback, reset } = useCheckin();

  const [code, setCode] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Live clock — updates every second to discourage screenshot reuse
  const [clockStr, setClockStr] = useState(() => formatTime(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setClockStr(formatTime(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  const isLoading = state.status === "loading";
  const canSubmit = code.trim().length === 4 && !isLoading;
  const showFallback = failCount >= FALLBACK_OFFER_AFTER;

  const handleSubmit = useCallback(async () => {
    Keyboard.dismiss();
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length !== 4) return;

    const result = await submit({ venueId, code: trimmedCode, lat, lng });

    if (result.ok && result.stamps >= STAMPS_PER_ROUND) {
      // Enough stamps to redeem — navigate to redemption screen
      navigation.replace("RoundRedemption", {
        venueId,
        venueName,
        lat,
        lng,
        stamps: result.stamps,
      });
    }
    // Otherwise stay on screen: state shows stamp progress
  }, [code, venueId, lat, lng, submit, navigation, venueName]);

  const handleFallback = useCallback(async () => {
    Keyboard.dismiss();
    reset();
    setCode("");

    const result = await submitFallback({ venueId, lat, lng });
    if (result.ok && result.stamps >= STAMPS_PER_ROUND) {
      navigation.replace("RoundRedemption", {
        venueId,
        venueName,
        lat,
        lng,
        stamps: result.stamps,
      });
    }
  }, [venueId, lat, lng, submitFallback, reset, navigation, venueName]);

  const handleReset = useCallback(() => {
    reset();
    setCode("");
    inputRef.current?.focus();
  }, [reset]);

  // ── Success view ──────────────────────────────────────────────────────────
  if (state.status === "success") {
    const { stamps, stampsToNext, isFirstVisit } = state;
    const roundComplete = stamps >= STAMPS_PER_ROUND;

    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.venueName}>{venueName}</Text>

        {isFirstVisit && (
          <View style={styles.firstVisitBadge}>
            <Text style={styles.firstVisitBadgeText}>First visit!</Text>
          </View>
        )}

        {/* Stamp card */}
        <View style={styles.stampCard}>
          <Text style={styles.stampCount}>
            {stamps} of {STAMPS_PER_ROUND}
          </Text>
          <View style={styles.stampDots}>
            {Array.from({ length: STAMPS_PER_ROUND }).map((_, i) => (
              <View
                key={i}
                style={[styles.stampDot, i < stamps && styles.stampDotFilled]}
              />
            ))}
          </View>
          {roundComplete ? (
            <Text style={styles.stampMessage}>
              The house buys your next round!
            </Text>
          ) : (
            <Text style={styles.stampMessage}>
              {stampsToNext} more {stampsToNext === 1 ? "visit" : "visits"} until your free round
            </Text>
          )}
        </View>

        {/* Anti-screenshot live clock */}
        <Text style={styles.liveClock}>{clockStr}</Text>
        <Text style={styles.liveClockLabel}>Check-in confirmed at this time</Text>

        {roundComplete && (
          <Pressable
            style={styles.redeemButton}
            onPress={() =>
              navigation.replace("RoundRedemption", {
                venueId,
                venueName,
                lat,
                lng,
                stamps,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Claim your free round"
          >
            <Text style={styles.redeemButtonText}>Claim your free round</Text>
          </Pressable>
        )}

        <Pressable
          style={styles.doneButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  // ── Main code-entry view ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <Text style={styles.venueName}>{venueName}</Text>
      <Text style={styles.instructions}>
        Ask your server for today's HappiTime code
      </Text>

      {/* 4-char code input */}
      <TextInput
        ref={inputRef}
        style={styles.codeInput}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        maxLength={4}
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardType="default"
        placeholder="CODE"
        placeholderTextColor={colors.inputPlaceholder}
        editable={!isLoading}
        onSubmitEditing={canSubmit ? handleSubmit : undefined}
        returnKeyType="done"
        accessibilityLabel="Enter check-in code"
      />

      {/* Error states */}
      {state.status === "bad_code" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Incorrect code.{" "}
            {state.attemptsRemaining > 0
              ? `${state.attemptsRemaining} attempt${state.attemptsRemaining !== 1 ? "s" : ""} remaining.`
              : "No attempts remaining — please wait a few minutes."}
          </Text>
        </View>
      )}

      {state.status === "out_of_range" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            You need to be at the venue to check in.
          </Text>
        </View>
      )}

      {state.status === "rate_limited" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Too many attempts. Please wait a few minutes.
          </Text>
        </View>
      )}

      {state.status === "employee_excluded" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Staff members cannot earn loyalty stamps at their own venue.
          </Text>
        </View>
      )}

      {state.status === "network_cap" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            You've reached today's check-in limit. Come back tomorrow!
          </Text>
        </View>
      )}

      {state.status === "fallback_limit" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            GPS-fallback limit reached for this venue. Please use the code from your server.
          </Text>
        </View>
      )}

      {state.status === "network_error" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Connection error. Please check your signal and try again.
          </Text>
        </View>
      )}

      {state.status === "error" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Something went wrong. Please try again.</Text>
        </View>
      )}

      {/* Submit button */}
      <Pressable
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Check in"
      >
        {isLoading ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Text style={styles.submitButtonText}>Check In</Text>
        )}
      </Pressable>

      {/* GPS-fallback offer (after 2 failures) */}
      {showFallback &&
        state.status !== "network_cap" &&
        state.status !== "employee_excluded" &&
        state.status !== "fallback_limit" && (
          <Pressable
            style={styles.fallbackLink}
            onPress={handleFallback}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Don't have the code? Use location instead"
          >
            <Text style={styles.fallbackLinkText}>
              Don't have the code? Use my location instead
            </Text>
          </Pressable>
        )}

      {/* Reset link if stuck in an irrecoverable error */}
      {(state.status === "rate_limited" ||
        state.status === "network_cap" ||
        state.status === "employee_excluded") && (
        <Pressable
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.cancelButtonText}>Go back</Text>
        </Pressable>
      )}

      {(state.status === "bad_code" ||
        state.status === "out_of_range" ||
        state.status === "fallback_limit" ||
        state.status === "network_error" ||
        state.status === "error") && (
        <Pressable
          style={styles.cancelButton}
          onPress={handleReset}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.cancelButtonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  venueName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  instructions: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  codeInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 2,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 12,
    color: colors.text,
    textAlign: "center",
    width: "100%",
    maxWidth: 220,
    marginBottom: spacing.lg,
  },
  errorBox: {
    backgroundColor: colors.errorLight,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    width: "100%",
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginBottom: spacing.lg,
    minHeight: 48,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  fallbackLink: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  fallbackLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  cancelButton: {
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  // ── Success state ────────────────────────────────────────────────────────
  firstVisitBadge: {
    backgroundColor: colors.successLight,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginBottom: spacing.lg,
  },
  firstVisitBadgeText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  stampCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.brandLight,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.xl,
  },
  stampCount: {
    color: colors.primary,
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: spacing.md,
  },
  stampDots: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stampDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 2,
    borderColor: colors.border,
  },
  stampDotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  stampMessage: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
  },
  liveClock: {
    color: colors.textMutedLight,
    fontSize: 26,
    fontWeight: "300",
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
    marginBottom: 2,
  },
  liveClockLabel: {
    color: colors.textMutedLight,
    fontSize: 11,
    marginBottom: spacing.xl,
    textAlign: "center",
  },
  redeemButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.md,
    minHeight: 48,
  },
  redeemButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  doneButton: {
    paddingVertical: spacing.sm,
  },
  doneButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
});
