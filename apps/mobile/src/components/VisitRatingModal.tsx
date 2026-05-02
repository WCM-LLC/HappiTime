// src/components/VisitRatingModal.tsx
import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { PendingVisit } from "../hooks/useVisitRating";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = {
  pendingVisit: PendingVisit | null;
  submitting: boolean;
  onSubmit: (rating: number, comment?: string, aspects?: string[]) => void;
  onDismiss: () => void;
};

const STAR_COUNT = 5;

const ASPECT_LABELS: Record<string, string> = {
  food_quality: "Food quality",
  service: "Service",
  drink_selection: "Drink selection",
  ambiance: "Ambiance",
  value: "Value",
};

export const VisitRatingModal: React.FC<Props> = ({
  pendingVisit,
  submitting,
  onSubmit,
  onDismiss,
}) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedAspects, setSelectedAspects] = useState<string[]>([]);

  // Reset state when a new visit appears
  React.useEffect(() => {
    if (pendingVisit) {
      setRating(0);
      setComment("");
      setSelectedAspects([]);
    }
  }, [pendingVisit?.venueId]);

  if (!pendingVisit) return null;

  const availableAspects = pendingVisit.aspects ?? [];
  const canSubmit = rating >= 1 && !submitting;

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>How was your visit?</Text>
          <Text style={styles.venueName}>{pendingVisit.venueName}</Text>

          {/* Star selector */}
          <View style={styles.starsRow}>
            {Array.from({ length: STAR_COUNT }, (_, i) => {
              const starIndex = i + 1;
              const filled = starIndex <= rating;
              return (
                <Pressable
                  key={starIndex}
                  onPress={() => setRating(starIndex)}
                  style={styles.starTouch}
                >
                  <Text style={[styles.star, filled && styles.starFilled]}>
                    {filled ? "\u2605" : "\u2606"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {rating > 0 && (
            <Text style={styles.ratingHint}>
              {rating === 1 && "Not great"}
              {rating === 2 && "It was okay"}
              {rating === 3 && "Pretty good"}
              {rating === 4 && "Really good"}
              {rating === 5 && "Loved it!"}
            </Text>
          )}

          {/* Aspect chips */}
          {availableAspects.length > 0 && (
            <View style={styles.chipsWrap}>
              {availableAspects.map((aspect) => {
                const selected = selectedAspects.includes(aspect);
                return (
                  <Pressable
                    key={aspect}
                    onPress={() =>
                      setSelectedAspects((prev) =>
                        prev.includes(aspect) ? prev.filter((a) => a !== aspect) : [...prev, aspect]
                      )
                    }
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {ASPECT_LABELS[aspect] ?? aspect.replaceAll("_", " ")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Comment input */}
          <TextInput
            style={styles.commentInput}
            placeholder="How was it?"
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Buttons */}
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              pressed && canSubmit && styles.submitButtonPressed,
            ]}
            onPress={() => canSubmit && onSubmit(rating, comment || undefined, selectedAspects)}
            disabled={!canSubmit}
          >
            <Text style={styles.submitButtonText}>
              {submitting ? "Submitting..." : "Submit"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.skipButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={onDismiss}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.lg,
    paddingTop: spacing.sm,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  venueName: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.lg,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  starTouch: {
    padding: spacing.xs,
  },
  star: {
    fontSize: 36,
    color: colors.border,
  },
  starFilled: {
    color: colors.primary,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
    justifyContent: "center",
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chipTextSelected: {
    color: "#fff",
  },
  ratingHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  commentInput: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground ?? colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    minHeight: 72,
    marginBottom: spacing.lg,
  },
  submitButton: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
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
  skipButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  skipButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
});
