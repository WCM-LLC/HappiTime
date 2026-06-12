// apps/mobile/src/screens/onboarding/LocationPrimeScreen.tsx
// Behavior-First Onboarding — S2: Location Prime
// Map visual: View-based approximation (react-native-svg not installed).

import * as Location from "expo-location";
import React, { useState } from "react";
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
  ObPrimaryButton,
  ObSecondaryButton,
} from "./atoms";

// ── Constants ────────────────────────────────────────────────────────────────

const HOODS = [
  "Westport",
  "Crossroads",
  "River Market",
  "Plaza",
  "Downtown",
  "Brookside",
  "Waldo",
  "North KC",
];

// ── Map visual (View approximation) ─────────────────────────────────────────
// Decorative grid + accent pins, no native SVG dependency.

const MapVisual: React.FC = () => (
  <View style={mapStyles.container}>
    {/* Grid rows — subtle horizontal lines */}
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <View
        key={`h${i}`}
        style={[mapStyles.gridLine, mapStyles.gridLineH, { top: i * 28 + 12 }]}
      />
    ))}
    {/* Grid columns — subtle vertical lines */}
    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
      <View
        key={`v${i}`}
        style={[mapStyles.gridLine, mapStyles.gridLineV, { left: i * 44 + 14 }]}
      />
    ))}

    {/* Accent range ring (dashed approximation: two stacked circles) */}
    <View style={mapStyles.ringOuter} />
    <View style={mapStyles.ringInner} />

    {/* Road block approximations */}
    <View style={[mapStyles.block, { left: 24, top: 46, width: 110, height: 13 }]} />
    <View style={[mapStyles.block, { left: 150, top: 68, width: 84, height: 13 }]} />
    <View style={[mapStyles.block, { left: 222, top: 42, width: 76, height: 13 }]} />
    <View style={[mapStyles.block, { left: 44, top: 104, width: 76, height: 10 }]} />
    <View style={[mapStyles.block, { left: 178, top: 118, width: 96, height: 10 }]} />

    {/* Secondary pins */}
    <Pin x={82} y={64} size={8} primary />
    <Pin x={232} y={58} size={8} primary />
    <Pin x={276} y={100} size={8} primary />
    <Pin x={118} y={120} size={8} primary />

    {/* "You are here" pin — dark, larger */}
    <Pin x={170} y={90} size={10} dark />
  </View>
);

const Pin: React.FC<{
  x: number;
  y: number;
  size: number;
  primary?: boolean;
  dark?: boolean;
}> = ({ x, y, size, dark }) => (
  <View
    style={[
      mapStyles.pin,
      {
        left: x - size,
        top: y - size,
        width: size * 2,
        height: size * 2,
        borderRadius: size,
        backgroundColor: dark ? colors.dark : colors.primary,
      },
    ]}
  >
    <View
      style={[
        mapStyles.pinDot,
        { width: size * 0.9, height: size * 0.9, borderRadius: size * 0.45 },
      ]}
    />
  </View>
);

const mapStyles = StyleSheet.create({
  container: {
    height: 170,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#DDE1EC",
    // shadow
    shadowColor: colors.dark,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  gridLine: {
    position: "absolute",
    backgroundColor: "#C8CDD8",
    opacity: 0.7,
  },
  gridLineH: {
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  gridLineV: {
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  block: {
    position: "absolute",
    borderRadius: 2,
    backgroundColor: "#C8CDD8",
  },
  ringOuter: {
    position: "absolute",
    left: 170 - 40,
    top: 90 - 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
    opacity: 0.5,
    backgroundColor: "transparent",
  },
  ringInner: {
    position: "absolute",
    left: 170 - 40,
    top: 90 - 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    opacity: 0.1,
  },
  pin: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.92,
  },
  pinDot: {
    backgroundColor: "#fff",
  },
});

// ── LocationPrimeScreen ──────────────────────────────────────────────────────

export type LocationPrimeScreenProps = {
  onBack: () => void;
  onContinue: () => void;
  hood: string | null;
  setHood: (h: string) => void;
  locationDenied: boolean;
  setLocationDenied: (v: boolean) => void;
};

export const LocationPrimeScreen: React.FC<LocationPrimeScreenProps> = ({
  onBack,
  onContinue,
  hood,
  setHood,
  locationDenied,
  setLocationDenied,
}) => {
  const insets = useSafeAreaInsets();
  const [manual, setManual] = useState(false);

  const showHoods = manual || locationDenied;

  const requestForegroundPermission = async (): Promise<"granted" | "denied"> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  };

  const handleEnableLocation = async () => {
    const result = await requestForegroundPermission();
    if (result === "granted") {
      onContinue();
    } else {
      setLocationDenied(true);
    }
  };

  const handleUseLocationInstead = async () => {
    const result = await requestForegroundPermission();
    if (result === "granted") {
      // Mirror the design's behaviour: supply a default hood then continue.
      setHood("Westport");
      onContinue();
    }
    // If still denied, stay on the picker — user already has a hood selected.
  };

  return (
    <View style={styles.screen}>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 2 }]}>
        <ObBackButton onPress={onBack} />
      </View>

      {/* ── Scrollable content ─────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Map visual */}
        <MapVisual />

        {/* Headline */}
        <Text style={styles.headline}>{"Deals within walking distance"}</Text>

        {/* Body copy — curly apostrophes from the design */}
        <Text style={styles.body}>
          {"HappiTime sorts tonight’s happy hours by how close they are. We only use your location while you’re using the app."}
        </Text>

        {/* Denied note (shown only when denied and NOT in manual mode) */}
        {locationDenied && !manual ? (
          <View style={styles.deniedNote}>
            <Text style={styles.deniedNoteText}>
              {"No problem — pick a neighborhood instead. You can turn location on later in Settings."}
            </Text>
          </View>
        ) : null}

        {/* Neighborhood picker */}
        {showHoods ? (
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerLabel}>{"NEIGHBORHOOD"}</Text>
            <View style={styles.chipsWrap}>
              {HOODS.map((h) => {
                const selected = hood === h;
                return (
                  <Pressable
                    key={h}
                    onPress={() => setHood(h)}
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
                        styles.chipText,
                        selected ? styles.chipTextSelected : styles.chipTextUnselected,
                      ]}
                    >
                      {h}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Footer buttons ─────────────────────────────────────────── */}
      <View style={styles.footer}>
        {showHoods ? (
          <>
            <ObPrimaryButton
              label={hood ? `Show deals in ${hood}` : "Pick a neighborhood"}
              onPress={onContinue}
              disabled={!hood}
            />
            {!locationDenied ? (
              <ObSecondaryButton
                label={"Use my location instead"}
                onPress={() => void handleUseLocationInstead()}
              />
            ) : null}
          </>
        ) : (
          <>
            <ObPrimaryButton
              label={"Enable location"}
              onPress={() => void handleEnableLocation()}
            />
            <ObSecondaryButton
              label={"Enter a neighborhood instead"}
              onPress={() => setManual(true)}
            />
          </>
        )}
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

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
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 20,
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
    marginTop: -8,
  },
  deniedNote: {
    backgroundColor: colors.brandSubtle,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deniedNoteText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 13 * 1.5,
  },
  pickerContainer: {
    gap: 10,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.06 * 12,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
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
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 14,
  },
  chipTextSelected: {
    color: "#fff",
  },
  chipTextUnselected: {
    color: colors.text,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 8,
  },
});
