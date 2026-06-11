// apps/mobile/src/screens/onboarding/atoms.tsx
// Shared atoms for all onboarding screens.

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../../theme/colors";

// ── ObLogo ──────────────────────────────────────────────────────────────────
// "Happi" in colors.text + "Time" in colors.primary, weight 800, letterSpacing -0.7

export const ObLogo: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <Text
    style={[
      styles.logoBase,
      { fontSize: size, lineHeight: size * 1.1 },
    ]}
    numberOfLines={1}
  >
    <Text style={{ color: colors.text }}>{"Happi"}</Text>
    <Text style={{ color: colors.primary }}>{"Time"}</Text>
  </Text>
);

// ── ObPrimaryButton ──────────────────────────────────────────────────────────
// Filled colors.primary; disabled → colors.borderStrong bg.
// busy → shows ActivityIndicator in place of label; keeps primary bg.

export const ObPrimaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}> = ({ label, onPress, disabled = false, busy = false }) => {
  const isInert = disabled || busy;
  return (
    <Pressable
      onPress={isInert ? undefined : onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        {
          backgroundColor: disabled
            ? colors.borderStrong
            : colors.primary,
          opacity: pressed && !isInert ? 0.9 : 1,
          transform: [{ scale: pressed && !isInert ? 0.98 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert }}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryBtnLabel}>{label}</Text>
      )}
    </Pressable>
  );
};

// ── ObSecondaryButton ────────────────────────────────────────────────────────
// Text-only, colors.textMuted 15/600, py 12, centered.

export const ObSecondaryButton: React.FC<{
  label: string;
  onPress: () => void;
}> = ({ label, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.secondaryBtn,
      { opacity: pressed ? 0.7 : 1 },
    ]}
    accessibilityRole="button"
  >
    <Text style={styles.secondaryBtnLabel}>{label}</Text>
  </Pressable>
);

// ── ObBackButton ─────────────────────────────────────────────────────────────
// 36×36 round colors.surface button, colors.border border, back chevron glyph.

export const ObBackButton: React.FC<{ onPress: () => void }> = ({
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.backBtn,
      { opacity: pressed ? 0.7 : 1 },
    ]}
    accessibilityRole="button"
    accessibilityLabel="Go back"
  >
    {/* U+2039 SINGLE LEFT-POINTING ANGLE QUOTATION MARK — approximates the back chevron */}
    <Text style={styles.backChevron}>{"‹"}</Text>
  </Pressable>
);

// ── ObCheckIcon ──────────────────────────────────────────────────────────────
// Check glyph used on selected vibe chips. U+2713 CHECK MARK (no emoji variant selector).

export const ObCheckIcon: React.FC<{ color?: string; size?: number }> = ({
  color = "#fff",
  size = 20,
}) => (
  <Text
    style={{
      color,
      fontSize: size,
      fontWeight: "700",
      lineHeight: size + 2,
      includeFontPadding: false,
    }}
  >
    {"✓"}
  </Text>
);

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  logoBase: {
    fontWeight: "800",
    letterSpacing: -0.7,
    includeFontPadding: false,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    width: "100%",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnLabel: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backChevron: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 26,
    includeFontPadding: false,
    // shift slightly right to visually center the asymmetric glyph
    marginRight: 2,
  },
});
