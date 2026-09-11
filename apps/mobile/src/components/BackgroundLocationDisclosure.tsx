import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

// Prominent disclosure shown BEFORE any background-location permission request,
// as required by Google Play policy. Wired to the "Visit reminders" opt-in.
export function BackgroundLocationDisclosure({ visible, onAccept, onDecline }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Turn on visit reminders?</Text>
          <Text style={styles.body}>
            HappiTime uses your location — including in the background, when the app is closed
            or not in use — to detect when you&apos;re near a participating venue and send
            optional happy-hour and visit reminders.{"\n\n"}This is optional; discovering,
            searching, and saving venues all work without it. You can turn it off any time in
            Settings.
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={onDecline} style={styles.secondary}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
            <Pressable onPress={onAccept} style={styles.primary}>
              <Text style={styles.primaryText}>Turn on reminders</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.lg,
    width: "100%",
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  secondary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  primary: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
