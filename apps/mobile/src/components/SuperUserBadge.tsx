import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type SuperUserBadgeProps = {
  role?: string | null;
  size?: "sm" | "md";
  variant?: "super_user" | "toastmaker";
};

export function SuperUserBadge({ role, size = "sm", variant = "super_user" }: SuperUserBadgeProps) {
  if (variant === "super_user") {
    if (role !== "super_user") return null;

    const diameter = size === "md" ? 20 : 16;
    const fontSize = size === "md" ? 10 : 8;

    return (
      <View
        accessibilityLabel="HappiTime Insider"
        style={[styles.circle, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}
      >
        <Text style={[styles.star, { fontSize }]}>★</Text>
      </View>
    );
  }

  // variant === "toastmaker"
  const glyphSize = size === "md" ? 18 : 14;

  return (
    <View
      accessibilityLabel="Toastmaker"
      style={[styles.toastmakerCircle, { width: glyphSize + 6, height: glyphSize + 6, borderRadius: (glyphSize + 6) / 2 }]}
    >
      <Text style={[styles.toastmakerGlyph, { fontSize: glyphSize - 2 }]}>🥂</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  star: {
    color: colors.surface,
    lineHeight: undefined,
    includeFontPadding: false,
  },
  // Was #F9F2E7 on #C0773A — two raw hex values that each sat a few points off
  // a token that already existed (brandSubtle #F5EDE3, primaryDark #A67842).
  // Near-miss copies of a palette entry are how a palette stops being one.
  // primaryDark rather than primary for the ring: 3.36:1 on brandSubtle and
  // 3.90:1 against the white around it, both over the 3:1 floor for a boundary.
  toastmakerCircle: {
    backgroundColor: colors.brandSubtle,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  toastmakerGlyph: {
    lineHeight: undefined,
    includeFontPadding: false,
  },
});
