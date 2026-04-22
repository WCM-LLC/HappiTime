import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

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
    color: "#6b7280",
  },
});

export default LoadingView;
