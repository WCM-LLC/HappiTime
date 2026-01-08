import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export const AddScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create</Text>
      <Text style={styles.subtitle}>
        Start a new list or save a venue you love.
      </Text>

      <View style={styles.optionCard}>
        <Text style={styles.optionTitle}>New List</Text>
        <Text style={styles.optionText}>
          Collect your favorite happy hours in one place.
        </Text>
      </View>

      <View style={styles.optionCard}>
        <Text style={styles.optionTitle}>New Venue</Text>
        <Text style={styles.optionText}>
          Share a spot with friends and keep it on your radar.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    marginBottom: spacing.xs
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.lg
  },
  optionCard: {
    backgroundColor: colors.card ?? colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  optionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.xs
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 13
  }
});
