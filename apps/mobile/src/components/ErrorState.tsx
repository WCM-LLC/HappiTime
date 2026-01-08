import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = {
  message?: string;
};

export const ErrorState: React.FC<Props> = ({ message }) => (
  <View style={styles.container}>
    <Text style={styles.title}>Something went wrong</Text>
    <Text style={styles.message}>{message ?? "Please pull to refresh or try again."}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    color: colors.error,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.sm
  },
  message: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: spacing.lg
  }
});
