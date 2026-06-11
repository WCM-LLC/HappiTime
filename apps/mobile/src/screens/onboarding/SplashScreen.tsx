// apps/mobile/src/screens/onboarding/SplashScreen.tsx
// Recreates ObSplash from docs/design/onboarding/ob-screens.jsx.

import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { ObLogo, ObPrimaryButton } from "./atoms";

export const SplashScreen: React.FC<{ onStart: () => void }> = ({
  onStart,
}) => (
  <SafeAreaView style={styles.safe}>
    {/* Centered content column */}
    <View style={styles.content}>
      <ObLogo />
      <Text style={styles.headline}>
        {"Kansas City’s happy hours, live."}
      </Text>
      <Text style={styles.subtitle}>
        {"Live deals at Kansas City bars and restaurants. Built by locals, for locals."}
      </Text>
    </View>

    {/* Bottom button column */}
    <View style={styles.bottom}>
      <ObPrimaryButton label="Find deals near me" onPress={onStart} />
      <Text style={styles.caption}>
        {"Browsing is free. No account needed."}
      </Text>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    justifyContent: "center",
    gap: 22,
  },
  headline: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -0.9,
    lineHeight: 44,
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 25,
  },
  bottom: {
    paddingHorizontal: 28,
    paddingBottom: 28,
    gap: 14,
  },
  caption: {
    fontSize: 12.5,
    color: colors.textMutedLight,
    fontWeight: "500",
    textAlign: "center",
  },
});
