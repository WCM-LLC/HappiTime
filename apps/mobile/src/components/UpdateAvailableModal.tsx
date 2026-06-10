import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { useUpdatePrompt } from "../hooks/useUpdatePrompt";

export const UpdateAvailableModal: React.FC = () => {
  const { release, visible, dismiss, openStore } = useUpdatePrompt();
  if (!release) return null;
  const critical = release.is_critical;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={critical ? () => {} : dismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Update available</Text>
          <Text style={styles.version}>Version {release.version}</Text>
          <ScrollView style={styles.changelogWrap} contentContainerStyle={styles.changelog}>
            {release.changelog.map((item, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.bullet}>{"•"}</Text>
                <Text style={styles.item}>{item}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={openStore}
            style={({ pressed }) => [styles.update, pressed && styles.pressed]}
          >
            <Text style={styles.updateText}>Update</Text>
          </Pressable>
          {!critical ? (
            <Pressable
              onPress={dismiss}
              style={({ pressed }) => [styles.later, pressed && styles.pressed]}
            >
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  version: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: spacing.xs },
  changelogWrap: { maxHeight: 220, marginTop: spacing.md },
  changelog: { gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm },
  bullet: { color: colors.primary, fontSize: 15, lineHeight: 21 },
  item: { color: colors.text, fontSize: 15, lineHeight: 21, flex: 1 },
  update: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  updateText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  later: { marginTop: spacing.sm, paddingVertical: spacing.sm, alignItems: "center" },
  laterText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.85 },
});
