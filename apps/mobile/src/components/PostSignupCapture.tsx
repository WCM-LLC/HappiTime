import type { Session } from "@supabase/supabase-js";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { isReservedHandle } from "@happitime/shared-types";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { supabase } from "../api/supabaseClient";
import { peekPendingReferral } from "../lib/pendingReferral";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type PostSignupCaptureProps = {
  session: Session;
  onComplete: () => void;
};

function validateHandle(value: string): string | null {
  if (value.length < 3) return "Handle must be at least 3 characters.";
  if (value.length > 20) return "Handle must be 20 characters or less.";
  if (!/^[a-z0-9_]+$/.test(value)) return "Letters, numbers, and underscores only.";
  if (value.startsWith("_") || value.endsWith("_")) return "Handle cannot start or end with an underscore.";
  if (/__/.test(value)) return "Handle cannot have consecutive underscores.";
  if (isReservedHandle(value)) return "That handle is reserved. Try a variation.";
  return null;
}

export function PostSignupCapture({ session, onComplete }: PostSignupCaptureProps) {
  const [handle, setHandle] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSuggestions, setHandleSuggestions] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [referrer, setReferrer] = useState("");

  // Prefill the referrer field from the durable stash (peek — does NOT consume it;
  // the auto-apply via useReferralCapture still runs separately on first session).
  useEffect(() => {
    peekPendingReferral().then((v) => {
      if (v) setReferrer(v);
    });
  }, []);

  const submit = async () => {
    const trimmed = handle.trim().toLowerCase();
    const err = validateHandle(trimmed);
    if (err) {
      setHandleError(err);
      setHandleSuggestions(
        err.includes("reserved") || err.includes("profan")
          ? [`${trimmed}1`, `${trimmed}_kc`, `${trimmed}_xx`]
          : []
      );
      return;
    }

    setChecking(true);
    setHandleError(null);
    setHandleSuggestions([]);

    const { data: existing } = await (supabase as any)
      .from("user_profiles")
      .select("handle")
      .eq("handle", trimmed)
      .maybeSingle();

    setChecking(false);
    if (existing) {
      setHandleError("That handle is already taken.");
      setHandleSuggestions([`${trimmed}1`, `${trimmed}_kc`, `${trimmed}_xx`]);
      return;
    }

    setSaving(true);
    const { error: saveError } = await (supabase as any)
      .from("user_profiles")
      .upsert(
        { user_id: session.user.id, handle: trimmed, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    setSaving(false);

    if (saveError) {
      if (saveError.code === "23505") {
        setHandleError("That handle was just taken. Try another.");
        setHandleSuggestions([`${trimmed}1`, `${trimmed}_kc`, `${trimmed}_xx`]);
      } else {
        setHandleError("Could not save your handle. Please try again.");
      }
      return;
    }

    // Record the referral (confirm/backstop — idempotent, first-wins on the server).
    // The durable stash auto-apply via useReferralCapture is separate and still runs.
    // Never block handle completion if this fails.
    const referrerTrimmed = referrer.trim();
    if (referrerTrimmed) {
      try {
        await (supabase as any).rpc("record_referral", {
          p_referrer_handle: referrerTrimmed,
          p_source: "code",
        });
      } catch {
        // Intentionally swallowed — referrer recording is best-effort
      }
    }

    onComplete();
  };

  const busy = checking || saving;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.iconCircle}>
          <IconSymbol name="at" size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>Claim your handle</Text>
        <Text style={styles.body}>
          Pick a unique @handle so friends can find and tag you. Lowercase letters, numbers, and underscores only.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Handle</Text>
          <View style={styles.handleRow}>
            <View style={styles.handlePrefix}>
              <Text style={styles.handlePrefixText}>@</Text>
            </View>
            <TextInput
              accessibilityLabel="Handle"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="yourusername"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.handleInput]}
              value={handle}
              onChangeText={(text) => {
                setHandle(text.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                setHandleError(null);
                setHandleSuggestions([]);
              }}
              maxLength={20}
            />
          </View>

          {handleError ? (
            <Text style={styles.handleErrorText}>{handleError}</Text>
          ) : null}

          {handleSuggestions.length > 0 ? (
            <View style={styles.suggestionRow}>
              <Text style={styles.suggestionLabel}>Try one of these:</Text>
              {handleSuggestions.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.suggestionChip, pressed && styles.pressed]}
                  onPress={() => {
                    setHandle(s);
                    setHandleError(null);
                    setHandleSuggestions([]);
                  }}
                >
                  <Text style={styles.suggestionChipText}>@{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.handleHint}>
            3–20 characters. Letters, numbers, and underscores only.
          </Text>

          <View style={styles.referrerSection}>
            <Text style={styles.label}>Who brought you? (optional)</Text>
            <View style={styles.handleRow}>
              <View style={styles.handlePrefix}>
                <Text style={styles.handlePrefixText}>@</Text>
              </View>
              <TextInput
                accessibilityLabel="Referrer handle"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="theirhandle"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.handleInput]}
                value={referrer}
                onChangeText={(text) =>
                  setReferrer(text.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
                maxLength={20}
              />
            </View>
            <Text style={styles.referrerHint}>
              If a HappiTime Insider invited you, their @handle gets the credit.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={busy || handle.trim().length === 0}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && !busy && styles.pressed,
              (busy || handle.trim().length === 0) && styles.disabled,
            ]}
            onPress={() => void submit()}
          >
            {busy ? (
              <ActivityIndicator color={colors.pillActiveText} />
            ) : (
              <Text style={styles.primaryButtonText}>Set my handle</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: "stretch",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.xl,
    paddingBottom: spacing.xxl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    marginBottom: spacing.md,
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 16,
  },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  handlePrefix: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: colors.border,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  handlePrefixText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: "600",
  },
  handleInput: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  handleErrorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "500",
  },
  handleHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  suggestionRow: {
    gap: spacing.xs,
  },
  suggestionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  suggestionChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  suggestionChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  referrerSection: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  referrerHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.pillActiveBg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primaryButtonText: {
    color: colors.pillActiveText,
    fontSize: 16,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.55,
  },
});
