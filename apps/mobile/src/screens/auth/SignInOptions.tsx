// src/screens/auth/SignInOptions.tsx
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
import { AppleSignInButton } from "../../components/AppleSignInButton";
import { supabase } from "../../api/supabaseClient";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

interface SignInOptionsProps {
  onAuthStarted?: () => void;
}

export const SignInOptions: React.FC<SignInOptionsProps> = ({
  onAuthStarted = () => {},
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const redirectTo = Linking.createURL("auth/callback", { scheme: "happitime" });

  const handleEmailContinue = async () => {
    const trimmed = email.trim();

    if (!trimmed) {
      setStatusMessage("Enter an email to continue.");
      return;
    }

    try {
      setLoading(true);
      setStatusMessage(null);
      onAuthStarted();

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

  const handleGoogleSignIn = async () => {
    try {
      setOauthLoading("google");
      setStatusMessage(null);
      onAuthStarted();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        console.error("Supabase Google auth error:", error);
        setStatusMessage(`Auth error: ${error.message}`);
        return;
      }

      if (!data?.url) {
        setStatusMessage("Google sign-in could not start. Please try again.");
        return;
      }

      await Linking.openURL(data.url);
      setStatusMessage("Complete Google sign-in in your browser to continue.");
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      setStatusMessage(err?.message ?? "Unexpected error during Google sign-in");
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.googleButton,
          pressed && styles.googleButtonPressed,
          oauthLoading === "google" && styles.primaryButtonDisabled
        ]}
        onPress={handleGoogleSignIn}
        disabled={loading || oauthLoading !== null}
      >
        {oauthLoading === "google" ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <Text style={styles.googleButtonIcon}>G</Text>
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      <AppleSignInButton
        disabled={loading || oauthLoading !== null}
        onStatusMessage={setStatusMessage}
      />

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

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
        disabled={loading || oauthLoading !== null}
      >
        {loading ? (
          <ActivityIndicator color={colors.pillActiveText} />
        ) : (
          <Text style={styles.primaryButtonText}>Continue</Text>
        )}
      </Pressable>

      {statusMessage ? (
        <Text style={styles.statusMessage}>{statusMessage}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center"
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
  googleButton: {
    width: "100%",
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  googleButtonPressed: {
    opacity: 0.9
  },
  googleButtonIcon: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
  },
  googleButtonText: {
    color: colors.text,
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
  statusMessage: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    width: "100%"
  }
});
