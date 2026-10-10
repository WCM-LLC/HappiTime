import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  message?: string;
};

export const LoadingView: React.FC<Props> = ({ message }) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    marginTop: 12,
    color: colors.textMuted,
  },
});

export default LoadingView;
