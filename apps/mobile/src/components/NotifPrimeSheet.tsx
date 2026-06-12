// Contextual push-permission prime, shown once after the first save. Asking at a
// value moment ("we just saved this — want a heads-up when its happy hour
// starts?") converts far better than an upfront cold prompt.
import * as Notifications from "expo-notifications";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type NotifPrimeSheetProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function NotifPrimeSheet({ visible, onDismiss }: NotifPrimeSheetProps) {
  const enable = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // permission denial / unavailable — nothing to do; token registration
      // (useConfigPushNotifications) will reflect the real status on next launch.
    } finally {
      onDismiss();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Get a heads-up before it starts?</Text>
          <Text style={styles.body}>
            We'll ping you when happy hour starts at the spots you save. No spam — just the deals you care about.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => void enable()}
          >
            <Text style={styles.primaryText}>Enable alerts</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onDismiss}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  primary: {
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.9 },
  secondary: { alignItems: "center", paddingVertical: spacing.sm },
  secondaryText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
});
