import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type SuperUserBadgeProps = {
  role?: string | null;
  size?: "sm" | "md";
};

export function SuperUserBadge({ role, size = "sm" }: SuperUserBadgeProps) {
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

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  star: {
    color: "#FFFFFF",
    lineHeight: undefined,
    includeFontPadding: false,
  },
});
