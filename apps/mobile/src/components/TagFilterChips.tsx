// src/components/TagFilterChips.tsx
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ApprovedTag } from "@happitime/shared-types";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type TagFilterChipsProps = {
  tags: ApprovedTag[];
  selectedSlugs: Set<string>;
  onToggle: (slug: string) => void;
  categoryLabel?: string;
};

/**
 * Horizontal scrollable rail of toggleable tag chips. Plain RN — chip styling
 * matches the pill tokens in theme/colors. Selected chips flip to the dark
 * "active pill" treatment.
 */
export const TagFilterChips: React.FC<TagFilterChipsProps> = ({
  tags,
  selectedSlugs,
  onToggle,
  categoryLabel,
}) => {
  if (tags.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      {categoryLabel ? (
        <Text style={styles.categoryLabel}>{categoryLabel}</Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        keyboardShouldPersistTaps="handled"
      >
        {tags.map((tag) => {
          const active = selectedSlugs.has(tag.slug);
          return (
            <Pressable
              key={tag.slug}
              onPress={() => onToggle(tag.slug)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && styles.chipPressed,
              ]}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
              >
                {tag.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.sm,
  },
  categoryLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  rail: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: 2,
    paddingRight: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.pillInactiveBg,
  },
  chipActive: {
    backgroundColor: colors.pillActiveBg,
    borderColor: colors.pillActiveBg,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    color: colors.pillInactiveText,
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.pillActiveText,
  },
});
