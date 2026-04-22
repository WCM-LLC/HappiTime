// src/screens/AuthScreen.tsx
import * as Linking from "expo-linking";
import React, { useState, useRef, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
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
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const redirectTo = Linking.createURL("auth/callback");

  const otpInputRef = useRef<TextInput | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    if (otpSent) {
      // Give a tick for UI to render then focus the OTP input
      const t = setTimeout(() => otpInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [otpSent]);

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) {
        clearInterval(resendIntervalRef.current);
        resendIntervalRef.current = null;
      }
    };
  }, []);

const handleEmailContinue = async () => {
  const trimmed = email.trim();

  if (!trimmed) {
    setStatusMessage("Enter an email to continue.");
    return;
  }

  try {
    setLoading(true);
    setStatusMessage(null);

    console.log("🔐 Sending OTP sign-in request…", trimmed);

    // Request an OTP to be sent to the user's email. Server email template
    // controls whether a magic link or token is sent — this client expects
    // an OTP token to arrive which the user will paste below.
    const { data, error } = await supabase.auth.signInWithOtp({
      email: trimmed,
    });

    console.log("📨 Supabase response:", { data, error });

    if (error) {
      console.error("❌ Supabase OTP error:", error);
      setStatusMessage(`Auth error: ${error.message}`);
      return;
    }

    setOtpSent(true);
    setStatusMessage("OTP sent. Check your email and enter the code below.");
    // Start a short cooldown to avoid immediate resends
    startResendCooldown(30);
  } catch (err: any) {
    console.error("🔥 Unexpected auth exception:", err);
    setStatusMessage(err?.message ?? "Unexpected error");
  } finally {
    setLoading(false);
  }
};

const startResendCooldown = (seconds: number) => {
  // clear existing
  if (resendIntervalRef.current) {
    clearInterval(resendIntervalRef.current);
    resendIntervalRef.current = null;
  }
  setResendSeconds(seconds);
  setResendDisabled(true);
  resendIntervalRef.current = setInterval(() => {
    setResendSeconds((s) => {
      if (s <= 1) {
        if (resendIntervalRef.current) {
          clearInterval(resendIntervalRef.current);
          resendIntervalRef.current = null;
        }
        setResendDisabled(false);
        return 0;
      }
      return s - 1;
    });
  }, 1000);
};

const handleVerifyCode = async () => {
  const token = otp.trim();
  if (!token) {
    setStatusMessage("Enter the code you received via email.");
    return;
  }

  try {
    setLoading(true);
    setStatusMessage(null);

    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

    console.log("🔁 verifyOtp result:", { data, error });

    if (error) {
      console.error("❌ verifyOtp error:", error);
      setStatusMessage(error.message);
      return;
    }
    setStatusMessage("Signed in successfully.");

    // Navigate to the main app. The auth state will also update and
    // the navigator will show the AppTabs, but navigate immediately
    // for a snappier UX.
    try {
      navigation.navigate("AppTabs");
    } catch (e) {
      /* ignore navigation errors */
    }
  } catch (err: any) {
    console.error("🔥 Unexpected verify exception:", err);
    setStatusMessage(err?.message ?? "Unexpected error");
  } finally {
    setLoading(false);
  }
};

const handleResendCode = async () => {
  const trimmed = email.trim();
  if (!trimmed) {
    setStatusMessage("Enter an email to continue.");
    return;
  }

  try {
    setStatusMessage(null);
    const { data, error } = await supabase.auth.signInWithOtp({ email: trimmed });
    if (error) {
      // Supabase may return a rate limit error like "email rate exceeded"
      console.error("❌ resend OTP error:", error);
      const msg = error.message ?? "Failed to resend code.";
      setStatusMessage(msg);
      if (/rate/i.test(msg)) {
        // apply a longer cooldown when hitting server-side rate limits
        startResendCooldown(300); // 5 minutes
      }
      return;
    }
    setStatusMessage("OTP resent. Check your email.");
    // Short cooldown for user-initiated resend
    startResendCooldown(30);
  } catch (err: any) {
    setStatusMessage(err?.message ?? "Unexpected error");
    setResendDisabled(false);
  }
};

  const handleOAuth = async (provider: "google" | "apple") => {
    try {
      setLoading(true);
      setStatusMessage(null);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (error) {
        console.error("[AuthScreen] oauth error", error);
        setStatusMessage(error.message);
        return;
      }

      // On mobile, Supabase opens the browser for OAuth.
      // We just show a small hint so it doesn't feel broken.
      if (data?.url) {
        setStatusMessage("Opening browser to continue sign in…");
      }
    } catch (err: any) {
      console.error("[AuthScreen] oauth unexpected error", err);
      setStatusMessage(err?.message ?? "Something went wrong.");
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
          editable={!otpSent}
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

        {otpSent ? (
          <>
            <TextInput
              ref={otpInputRef}
              style={styles.input}
              placeholder="Enter code"
              placeholderTextColor={colors.inputPlaceholder}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
            />

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                loading && styles.primaryButtonDisabled
              ]}
              onPress={handleVerifyCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.pillActiveText} />
              ) : (
                <Text style={styles.primaryButtonText}>Verify Code</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                { marginTop: 6 },
                pressed && { opacity: 0.8 }
              ]}
              onPress={handleResendCode}
              disabled={resendSeconds > 0 || loading}
            >
              <Text style={[styles.resendText, resendSeconds > 0 && styles.resendDisabled]}>
                {resendSeconds > 0 ? `Resend code (${resendSeconds}s)` : "Resend code"}
              </Text>
            </Pressable>
          </>
        ) : null}

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google */}
        <Pressable
          style={({ pressed }) => [
            styles.oauthButton,
            pressed && styles.oauthButtonPressed
          ]}
          onPress={() => handleOAuth("google")}
        >
          <View style={styles.oauthIcon} />
          <Text style={styles.oauthButtonText}>Continue with Google</Text>
        </Pressable>

        {/* Apple */}
        <Pressable
          style={({ pressed }) => [
            styles.oauthButton,
            pressed && styles.oauthButtonPressed
          ]}
          onPress={() => handleOAuth("apple")}
        >
          <View style={styles.oauthIcon} />
          <Text style={styles.oauthButtonText}>Continue with Apple</Text>
        </Pressable>

        {statusMessage ? (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        ) : null}

        <Text style={styles.legalText}>
          By clicking continue, you agree to our{" "}
          <Text
            style={styles.linkText}
            onPress={() => Linking.openURL("https://happitime.app/terms")}
          >
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text
            style={styles.linkText}
            onPress={() => Linking.openURL("https://happitime.app/privacy")}
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
  ,
  resendText: {
    marginTop: 6,
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    width: "100%"
  },
  resendDisabled: {
    color: colors.textMuted,
    opacity: 0.7
  }
});
