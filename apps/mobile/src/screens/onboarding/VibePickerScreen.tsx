// apps/mobile/src/screens/onboarding/VibePickerScreen.tsx
// Behavior-First Onboarding — S3: Vibe Picker (skippable)

import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import {
  ObBackButton,
  ObCheckIcon,
  ObPrimaryButton,
} from "./atoms";

// ── Constants ────────────────────────────────────────────────────────────────

const VIBES: [string, string][] = [
  ["dive", "Dive bar"],
  ["cocktails", "Cocktails"],
  ["patio", "Patio"],
  ["rooftop", "Rooftop"],
  ["sports", "Sports bar"],
  ["late", "Late-night eats"],
  ["brewery", "Brewery"],
  ["margs", "Margs & tacos"],
  ["wine", "Wine"],
];

// ── VibePickerScreen ──────────────────────────────────────────────────────────

export type VibePickerScreenProps = {
  onBack: () => void;
  onContinue: () => void;
  vibes: string[];
  setVibes: (v: string[]) => void;
};

export const VibePickerScreen: React.FC<VibePickerScreenProps> = ({
  onBack,
  onContinue,
  vibes,
  setVibes,
}) => {
  const insets = useSafeAreaInsets();

  const toggle = (v: string) => {
    if (vibes.includes(v)) {
      setVibes(vibes.filter((x) => x !== v));
    } else {
      setVibes([...vibes, v]);
    }
  };

  const handleSkip = () => {
    setVibes([]);
    onContinue();
  };

  const n = vibes.length;
  const ctaLabel =
    n > 0 ? `Show tonight’s deals (${n})` : "Show tonight’s deals";

  return (
    <View style={styles.screen}>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 2 }]}>
        <ObBackButton onPress={onBack} />
        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [
            styles.skipBtn,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Skip"
        >
          <Text style={styles.skipLabel}>{"Skip"}</Text>
        </Pressable>
      </View>

      {/* ── Scrollable content ─────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Headline — curly apostrophe from the design */}
        <Text style={styles.headline}>{"What’s your scene?"}</Text>

        {/* Body copy — curly apostrophes from the design */}
        <Text style={styles.body}>
          {"Pick any. This filters tonight’s deals — change it whenever."}
        </Text>

        {/* 2-column vibe grid */}
        <View style={styles.grid}>
          {VIBES.map(([v, label]) => {
            const selected = vibes.includes(v);
            return (
              <Pressable
                key={v}
                onPress={() => toggle(v)}
                style={({ pressed }) => [
                  styles.chip,
                  selected ? styles.chipSelected : styles.chipUnselected,
                  pressed && styles.chipPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    selected
                      ? styles.chipLabelSelected
                      : styles.chipLabelUnselected,
                  ]}
                >
                  {label}
                </Text>
                {selected ? <ObCheckIcon color="#fff" size={15} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <ObPrimaryButton label={ctaLabel} onPress={onContinue} />
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const CHIP_GAP = 10;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    minHeight: 44,
    paddingHorizontal: 20,
    paddingTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 14,
  },
  headline: {
    fontSize: 29,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
    lineHeight: 29 * 1.12,
  },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 15 * 1.55,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CHIP_GAP,
    marginTop: 8,
  },
  chip: {
    // Each chip takes ~half the row width, accounting for the single gap between them.
    // Using percentage here; gap handles the spacing between the two columns.
    width: "48%",
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: colors.dark,
    borderColor: colors.dark,
  },
  chipUnselected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  chipLabelSelected: {
    color: "#fff",
  },
  chipLabelUnselected: {
    color: colors.text,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 30,
  },
});
