// src/screens/AuthScreen.tsx
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { supabase } from "../api/supabaseClient";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const redirectTo = Linking.createURL("auth/callback");

  const handleEmailContinue = async () => {
    const trimmed = email.trim();

    if (!trimmed) {
      setStatusMessage("Enter an email to continue.");
      return;
    }

    try {
      setLoading(true);
      setStatusMessage(null);

      console.log("🔐 Starting magic link sign-in…", trimmed);

      const { data, error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo }
      });

      console.log("📨 Supabase response:", { data, error });

      if (error) {
        console.error("❌ Supabase OTP error:", error);
        setStatusMessage(`Auth error: ${error.message}`);
        return;
      }

      if (!data) {
        console.warn("⚠ No data returned from OTP request");
      }

      setStatusMessage("Magic link sent. Check your email 👍");
    } catch (err: any) {
      console.error("🔥 Unexpected auth exception:", err);
      setStatusMessage(err?.message ?? "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top safe area spacer is handled by paddingTop */}
      <Text style={styles.logoText}>HappiTime</Text>

      <View style={styles.content}>
        <Text style={styles.title}>Create an Account</Text>
        <Text style={styles.subtitle}>
          Enter your email to sign up for this app
        </Text>

        <TextInput
          style={styles.input}
          placeholder="email@domain.com"
          placeholderTextColor={colors.inputPlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            loading && styles.primaryButtonDisabled
          ]}
          onPress={handleEmailContinue}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.pillActiveText} />
          ) : (
            <Text style={styles.primaryButtonText}>Continue</Text>
          )}
        </Pressable>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google */}
        <Pressable
          style={styles.oauthButtonDisabled}
          disabled
          accessibilityState={{ disabled: true }}
          accessibilityHint="Google sign in is coming soon and currently unavailable"
        >
          <View style={styles.oauthIcon} />
          <View style={styles.oauthTextContainer}>
            <Text style={styles.oauthButtonText}>Continue with Google</Text>
            <Text style={styles.oauthComingSoonText}>Coming Soon</Text>
          </View>
        </Pressable>

        {/* Apple */}
        <Pressable
          style={styles.oauthButtonDisabled}
          disabled
          accessibilityState={{ disabled: true }}
          accessibilityHint="Apple sign in is coming soon and currently unavailable"
        >
          <View style={styles.oauthIcon} />
          <View style={styles.oauthTextContainer}>
            <Text style={styles.oauthButtonText}>Continue with Apple</Text>
            <Text style={styles.oauthComingSoonText}>Coming Soon</Text>
          </View>
        </Pressable>

        {statusMessage ? (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        ) : null}

        <Text style={styles.legalText}>
          By clicking continue, you agree to our{" "}
          <Text
            style={styles.linkText}
            onPress={() => Linking.openURL("https://happitime.biz/terms")}
          >
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text
            style={styles.linkText}
            onPress={() => Linking.openURL("https://happitime.biz/privacy")}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 80,
    paddingHorizontal: spacing.lg,
    alignItems: "stretch"
  },
  logoText: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: spacing.xl,
    textAlign: "center",
    alignSelf: "center"
  },
  content: {
    width: "100%",
    alignItems: "center"
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.sm
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.lg
  },
  input: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md
  },
  primaryButton: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: colors.pillActiveBg,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginBottom: spacing.lg
  },
  primaryButtonPressed: {
    opacity: 0.9
  },
  primaryButtonDisabled: {
    opacity: 0.6
  },
  primaryButtonText: {
    color: colors.pillActiveText,
    fontSize: 16,
    fontWeight: "600"
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    width: "100%"
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border
  },
  dividerText: {
    marginHorizontal: spacing.sm,
    color: colors.textMuted,
    fontSize: 13
  },
  oauthButton: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm
  },
  oauthButtonPressed: {
    opacity: 0.9
  },
  oauthButtonDisabled: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    opacity: 0.55
  },
  oauthTextContainer: {
    alignItems: "center"
  },
  oauthIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border
  },
  oauthButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500"
  },
  oauthComingSoonText: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500"
  },
  statusMessage: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    width: "100%"
  },
  legalText: {
    marginTop: spacing.lg,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    width: "100%"
  },
  linkText: {
    color: colors.primary,
    fontWeight: "500"
  }
});
