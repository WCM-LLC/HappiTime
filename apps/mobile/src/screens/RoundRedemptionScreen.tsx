// src/screens/RoundRedemptionScreen.tsx
//
// Pilot round-redemption screen.
//
// When a user reaches 5 stamps they are navigated here. They re-enter today's
// code to confirm — this calls verify-checkin with { redeem: true }, which
// validates the code, inserts a round_redemptions row, and resets the derived
// stamp count to 0.
//
// Navigation params: { venueId, venueName, lat, lng, stamps }

import React, { useCallback, useState } from "react";
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

type Props = NativeStackScreenProps<RootStackParamList, "RoundRedemption">;

export const RoundRedemptionScreen: React.FC<Props> = ({ route, navigation }) => {
  const { venueId, venueName, lat, lng } = route.params;
  const insets = useSafeAreaInsets();

  const { state, submitRedeem, reset } = useCheckin();

  const [code, setCode] = useState("");

  const isLoading = state.status === "loading";
  const canSubmit = code.trim().length === 4 && !isLoading;

  const handleRedeem = useCallback(async () => {
    Keyboard.dismiss();
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length !== 4) return;

    await submitRedeem({ venueId, code: trimmedCode, lat, lng });
    // State updated by hook — success screen rendered below
  }, [code, venueId, lat, lng, submitRedeem]);

  const handleReset = useCallback(() => {
    reset();
    setCode("");
  }, [reset]);

  // ── Redeemed success view ─────────────────────────────────────────────────
  if (state.status === "success" && state.redeemed) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}
      >
        <Text style={styles.celebrationEmoji}>🍻</Text>
        <Text style={styles.celebrationTitle}>Round on the house!</Text>
        <Text style={styles.celebrationSubtitle}>
          Show this screen to your server. Your stamp card resets now — enjoy!
        </Text>
        <Text style={styles.venueName}>{venueName}</Text>

        <Pressable
          style={styles.doneButton}
          onPress={() => navigation.popToTop()}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  // ── Code-entry view ───────────────────────────────────────────────────────
  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      <Text style={styles.celebrationEmoji}>🎉</Text>
      <Text style={styles.title}>Round on the house!</Text>
      <Text style={styles.subtitle}>
        You've earned it. Enter today's code one more time to confirm with your server.
      </Text>
      <Text style={styles.venueName}>{venueName}</Text>

      {/* Code input */}
      <TextInput
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
        onSubmitEditing={canSubmit ? handleRedeem : undefined}
        returnKeyType="done"
        accessibilityLabel="Enter confirmation code"
      />

      {/* Error states */}
      {state.status === "bad_code" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Incorrect code.{" "}
            {state.attemptsRemaining > 0
              ? `${state.attemptsRemaining} attempt${state.attemptsRemaining !== 1 ? "s" : ""} remaining.`
              : "Please wait a few minutes and try again."}
          </Text>
        </View>
      )}

      {state.status === "insufficient_stamps" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Not enough stamps to redeem ({state.stamps} of 5). Keep checking in!
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

      {/* Confirm button */}
      <Pressable
        style={[styles.redeemButton, !canSubmit && styles.redeemButtonDisabled]}
        onPress={handleRedeem}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Confirm and redeem"
      >
        {isLoading ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Text style={styles.redeemButtonText}>Confirm &amp; Redeem</Text>
        )}
      </Pressable>

      {/* Try again / cancel */}
      {(state.status === "bad_code" ||
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

      <Pressable
        style={styles.cancelButton}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Not now"
      >
        <Text style={styles.cancelButtonText}>Not now</Text>
      </Pressable>
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
  celebrationEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  celebrationTitle: {
    color: colors.primary,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  celebrationSubtitle: {
    color: colors.textMuted,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  venueName: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: spacing.xl,
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
  redeemButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.md,
    minHeight: 48,
    justifyContent: "center",
  },
  redeemButtonDisabled: {
    opacity: 0.5,
  },
  redeemButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    width: "100%",
    marginTop: spacing.lg,
    minHeight: 48,
    justifyContent: "center",
  },
  doneButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
});
