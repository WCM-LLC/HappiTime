// src/screens/AddScreen.tsx
// Retained as a standalone venue suggestion form.
// The "New Itinerary" flow has been moved into FavoritesScreen.
// The "Suggest a Venue" link is now available from ProfileScreen.

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type VenueSuggestionFormProps = {
  onBack?: () => void;
};

export const VenueSuggestionForm: React.FC<VenueSuggestionFormProps> = ({ onBack }) => {
  const { user } = useCurrentUser();
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isValid = venueName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid || !user?.id) return;

    setSaving(true);
    const { error } = await supabase.from("user_events").insert({
      user_id: user.id,
      event_type: "venue_suggestion",
      venue_id: null,
      meta: {
        venue_name: venueName.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        notes: notes.trim() || null,
      },
    });
    setSaving(false);

    if (error) {
      Alert.alert("Something went wrong", error.message);
      return;
    }

    Alert.alert(
      "Thanks!",
      "We've received your suggestion and will look into adding this venue.",
      [{ text: "Done", onPress: () => {
        setVenueName("");
        setAddress("");
        setCity("");
        setState("");
        setNotes("");
        onBack?.();
      }}]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {onBack && (
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>{"\u2190"} Back</Text>
          </Pressable>
        )}

        <Text style={styles.title}>Suggest a Venue</Text>
        <Text style={styles.subtitle}>
          Fill in what you know — even just the name helps.
        </Text>

        <View style={styles.formCard}>
          <Text style={styles.label}>Venue name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. The Peanut"
            placeholderTextColor={colors.textMuted}
            value={venueName}
            onChangeText={setVenueName}
            returnKeyType="next"
          />

          <Text style={styles.label}>Street address</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 5012 Main St"
            placeholderTextColor={colors.textMuted}
            value={address}
            onChangeText={setAddress}
            returnKeyType="next"
          />

          <Text style={styles.label}>City & State</Text>
          <View style={styles.cityRow}>
            <TextInput
              style={[styles.input, styles.cityInput]}
              placeholder="City"
              placeholderTextColor={colors.textMuted}
              value={city}
              onChangeText={setCity}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.input, styles.stateInput]}
              placeholder="ST"
              placeholderTextColor={colors.textMuted}
              value={state}
              onChangeText={setState}
              autoCapitalize="characters"
              maxLength={2}
              returnKeyType="next"
            />
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Anything else we should know -- hours, specials, website..."
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            returnKeyType="done"
          />

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              !isValid && styles.submitButtonDisabled,
              pressed && isValid && styles.submitButtonPressed,
            ]}
            onPress={handleSubmit}
            disabled={!isValid || saving}
          >
            <Text style={styles.submitButtonText}>
              {saving ? "Submitting..." : "Submit suggestion"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// Legacy default export for backward compat
export const AddScreen = VenueSuggestionForm;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xxl + spacing.md,
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  backButton: {
    marginBottom: spacing.md,
  },
  backText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  formCard: {
    backgroundColor: colors.surface ?? colors.background,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground ?? colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.md,
  },
  cityRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cityInput: {
    flex: 1,
  },
  stateInput: {
    width: 52,
    textAlign: "center",
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitButton: {
    marginTop: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
