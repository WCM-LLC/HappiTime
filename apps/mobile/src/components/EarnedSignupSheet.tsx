import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SignInOptions } from "../screens/auth/SignInOptions";
import type { GatedActionKind } from "../lib/gatedAction";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

interface EarnedSignupSheetProps {
  kind: GatedActionKind | null;
  onDismiss: () => void;
}

const COPY: Record<GatedActionKind, { title: string; subtitle: string }> = {
  save: {
    title: "Save your spots",
    subtitle: "Create a free account to save venues and build itineraries.",
  },
  checkin: {
    title: "Start earning rounds",
    subtitle: "Create a free account to check in and earn your buyback.",
  },
};

export function EarnedSignupSheet({ kind, onDismiss }: EarnedSignupSheetProps) {
  if (kind === null) return null;

  const { title, subtitle } = COPY[kind];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <SignInOptions />
          <Pressable
            style={({ pressed }) => [styles.notNowButton, pressed && styles.notNowPressed]}
            onPress={onDismiss}
          >
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 26, 26, 0.52)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  notNowButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  notNowPressed: {
    opacity: 0.6,
  },
  notNowText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
});
