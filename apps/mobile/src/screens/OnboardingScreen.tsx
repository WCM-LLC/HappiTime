import type { Session } from "@supabase/supabase-js";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { IconSymbol } from "../../components/ui/icon-symbol";
import {
  INTEREST_OPTIONS,
  ONBOARDING_STEPS,
  nextOnboardingStep,
  previousOnboardingStep,
  type OnboardingCompletionInput,
  type OnboardingPermissionStatus,
  type OnboardingStep,
} from "../onboarding/state";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type OnboardingScreenProps = {
  session: Session;
  initialStep: OnboardingStep;
  onProgress: (step: OnboardingStep) => Promise<{ error: unknown }>;
  onComplete: (
    input: OnboardingCompletionInput
  ) => Promise<{ error: Error | null; usedLocalFallback: boolean }>;
};

const stepContent: Record<
  OnboardingStep,
  {
    icon: "star.fill" | "location.fill" | "heart" | "bell.fill" | "person.crop.circle.fill" | "checkmark.seal.fill";
    title: string;
    body: string;
  }
> = {
  welcome: {
    icon: "star.fill",
    title: "Find the good hours",
    body: "HappiTime helps you discover nearby happy hours, menus, venues, and local food and drink deals without digging around.",
  },
  location: {
    icon: "location.fill",
    title: "Start with your area",
    body: "Choose a home city or use your current location so maps, venue lists, and nearby reminders start in the right place.",
  },
  preferences: {
    icon: "heart",
    title: "Tune your picks",
    body: "Pick a few things you care about so HappiTime can prioritize the places and moments that fit your style.",
  },
  notifications: {
    icon: "bell.fill",
    title: "Decide what can ping you",
    body: "Turn on useful alerts for happy hours, saved venues, and friend activity. You can change these later from Profile.",
  },
  profile: {
    icon: "person.crop.circle.fill",
    title: "Add a profile name",
    body: "Keep this light. A display name helps saved lists, follows, and community activity feel less anonymous.",
  },
  complete: {
    icon: "checkmark.seal.fill",
    title: "You are set",
    body: "Your setup is ready. Start exploring nearby happy hours, save favorites, and build your go-to list.",
  },
};

const normalizePermissionStatus = (status: string): OnboardingPermissionStatus => {
  if (status === "granted" || status === "denied") return status;
  return "undetermined";
};

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  session,
  initialStep,
  onProgress,
  onComplete,
}) => {
  const defaultDisplayName =
    (session.user.user_metadata?.full_name as string | undefined) ??
    (session.user.user_metadata?.display_name as string | undefined) ??
    session.user.email?.split("@")[0] ??
    "";

  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [homeCity, setHomeCity] = useState("");
  const [homeState, setHomeState] = useState("");
  const [homeLat, setHomeLat] = useState<number | null>(null);
  const [homeLng, setHomeLng] = useState<number | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationPermissionStatus, setLocationPermissionStatus] =
    useState<OnboardingPermissionStatus | null>(null);
  const [notificationPermissionStatus, setNotificationPermissionStatus] =
    useState<OnboardingPermissionStatus | null>(null);
  const [interests, setInterests] = useState<string[]>(["happy_hours"]);
  const [notificationsPush, setNotificationsPush] = useState(false);
  const [notificationsHappyHours, setNotificationsHappyHours] = useState(true);
  const [notificationsVenueUpdates, setNotificationsVenueUpdates] = useState(true);
  const [notificationsFriendActivity, setNotificationsFriendActivity] = useState(true);
  const [notificationsProduct, setNotificationsProduct] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const currentIndex = ONBOARDING_STEPS.indexOf(step);
  const current = stepContent[step];
  const selectedInterestSet = useMemo(() => new Set(interests), [interests]);

  const goToStep = async (nextStep: OnboardingStep) => {
    setStatusMessage(null);
    setStep(nextStep);
    const { error } = await onProgress(nextStep);
    if (error) {
      setStatusMessage("Progress is saved on this device. Cloud sync will retry later.");
    }
  };

  const goNext = () => {
    void goToStep(nextOnboardingStep(step));
  };

  const goBack = () => {
    if (step === "welcome") return;
    void goToStep(previousOnboardingStep(step));
  };

  const skipToComplete = () => {
    setLocationEnabled(false);
    setNotificationsPush(false);
    setInterests([]);
    void goToStep("complete");
  };

  const toggleInterest = (value: string) => {
    setInterests((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  };

  const requestLocation = async () => {
    setLocationLoading(true);
    setStatusMessage(null);

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      const status = normalizePermissionStatus(permission.status);
      setLocationPermissionStatus(status);

      if (status !== "granted") {
        setLocationEnabled(false);
        setStatusMessage("Location was not enabled. You can still continue with a city.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setHomeLat(location.coords.latitude);
      setHomeLng(location.coords.longitude);
      setLocationEnabled(true);

      try {
        const [place] = await Location.reverseGeocodeAsync(location.coords);
        if (place?.city) setHomeCity(place.city);
        if (place?.region) setHomeState(place.region.slice(0, 2).toUpperCase());
      } catch {
        // Coordinates are enough for nearby discovery when reverse geocoding is unavailable.
      }

      setStatusMessage("Location enabled for nearby discovery.");
    } catch (error) {
      setLocationEnabled(false);
      setStatusMessage(error instanceof Error ? error.message : "Unable to enable location.");
    } finally {
      setLocationLoading(false);
    }
  };

  const requestNotifications = async () => {
    setNotificationLoading(true);
    setStatusMessage(null);

    try {
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== "granted") {
        permission = await Notifications.requestPermissionsAsync();
      }

      const status = normalizePermissionStatus(permission.status);
      setNotificationPermissionStatus(status);
      setNotificationsPush(status === "granted");
      setStatusMessage(
        status === "granted"
          ? "Notifications enabled."
          : "Notifications were not enabled. You can still continue."
      );
    } catch (error) {
      setNotificationsPush(false);
      setStatusMessage(error instanceof Error ? error.message : "Unable to enable notifications.");
    } finally {
      setNotificationLoading(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    setStatusMessage(null);
    const result = await onComplete({
      display_name: displayName,
      home_city: homeCity,
      home_state: homeState,
      home_lat: homeLat,
      home_lng: homeLng,
      interests,
      location_enabled: locationEnabled,
      location_permission_status: locationPermissionStatus,
      notifications_permission_status: notificationPermissionStatus,
      notifications_push: notificationsPush,
      notifications_happy_hours: notificationsPush && notificationsHappyHours,
      notifications_venue_updates: notificationsPush && notificationsVenueUpdates,
      notifications_friend_activity: notificationsPush && notificationsFriendActivity,
      notifications_product: notificationsProduct,
    });
    setSaving(false);

    if (result.error && !result.usedLocalFallback) {
      setStatusMessage(result.error.message);
    }
  };

  const renderStep = () => {
    if (step === "welcome") {
      return (
        <>
          <View style={styles.valueList}>
            <Text style={styles.valueItem}>Nearby happy hours and current deals</Text>
            <Text style={styles.valueItem}>Menus, venue details, and maps in one place</Text>
            <Text style={styles.valueItem}>Saved favorites, lists, and activity after sign-in</Text>
          </View>
          <PrimaryButton label="Start setup" onPress={goNext} />
          <SecondaryButton label="Skip setup" onPress={skipToComplete} />
        </>
      );
    }

    if (step === "location") {
      return (
        <>
          <Text style={styles.label}>Home city</Text>
          <View style={styles.cityRow}>
            <TextInput
              accessibilityLabel="Home city"
              autoCapitalize="words"
              placeholder="Kansas City"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.cityInput]}
              value={homeCity}
              onChangeText={setHomeCity}
            />
            <TextInput
              accessibilityLabel="Home state"
              autoCapitalize="characters"
              maxLength={2}
              placeholder="MO"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.stateInput]}
              value={homeState}
              onChangeText={setHomeState}
            />
          </View>
          <SecondaryButton
            label={locationLoading ? "Checking location..." : "Use current location"}
            onPress={() => void requestLocation()}
            disabled={locationLoading}
            loading={locationLoading}
          />
          <PrimaryButton label="Continue" onPress={goNext} />
          <SecondaryButton label="Skip location" onPress={goNext} />
        </>
      );
    }

    if (step === "preferences") {
      return (
        <>
          <View style={styles.chipGrid}>
            {INTEREST_OPTIONS.map((option) => {
              const selected = selectedInterestSet.has(option.value);
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => toggleInterest(option.value)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <PrimaryButton label="Continue" onPress={goNext} />
          <SecondaryButton label="Skip preferences" onPress={goNext} />
        </>
      );
    }

    if (step === "notifications") {
      return (
        <>
          <View style={styles.switchGroup}>
            <SwitchRow
              label="Push notifications"
              value={notificationsPush}
              onValueChange={setNotificationsPush}
            />
            {notificationsPush ? (
              <>
                <SwitchRow
                  label="Nearby happy hours"
                  value={notificationsHappyHours}
                  onValueChange={setNotificationsHappyHours}
                  indented
                />
                <SwitchRow
                  label="Saved venue updates"
                  value={notificationsVenueUpdates}
                  onValueChange={setNotificationsVenueUpdates}
                  indented
                />
                <SwitchRow
                  label="Friend activity"
                  value={notificationsFriendActivity}
                  onValueChange={setNotificationsFriendActivity}
                  indented
                />
              </>
            ) : null}
            <SwitchRow
              label="Product updates"
              value={notificationsProduct}
              onValueChange={setNotificationsProduct}
            />
          </View>
          <SecondaryButton
            label={notificationLoading ? "Opening permission..." : "Ask iOS now"}
            onPress={() => void requestNotifications()}
            disabled={notificationLoading}
            loading={notificationLoading}
          />
          <PrimaryButton label="Continue" onPress={goNext} />
          <SecondaryButton
            label="Skip alerts"
            onPress={() => {
              setNotificationsPush(false);
              goNext();
            }}
          />
        </>
      );
    }

    if (step === "profile") {
      return (
        <>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            accessibilityLabel="Display name"
            autoCapitalize="words"
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
          />
          <PrimaryButton label="Review setup" onPress={goNext} />
          <SecondaryButton label="Skip profile name" onPress={goNext} />
        </>
      );
    }

    return (
      <>
        <View style={styles.summaryList}>
          <SummaryItem label="Area" value={homeCity ? `${homeCity}${homeState ? `, ${homeState}` : ""}` : "Not set"} />
          <SummaryItem label="Interests" value={interests.length > 0 ? `${interests.length} selected` : "Skipped"} />
          <SummaryItem label="Notifications" value={notificationsPush ? "Enabled" : "Off"} />
          <SummaryItem label="Location" value={locationEnabled ? "Enabled" : "Manual or skipped"} />
        </View>
        <PrimaryButton
          label={saving ? "Saving setup..." : "Start exploring"}
          onPress={() => void finish()}
          disabled={saving}
          loading={saving}
        />
      </>
    );
  };

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
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            disabled={step === "welcome"}
            style={({ pressed }) => [
              styles.backButton,
              step === "welcome" && styles.hidden,
              pressed && styles.pressed,
            ]}
            onPress={goBack}
          >
            <IconSymbol name="chevron.left" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.stepCounter}>
            {Math.min(currentIndex + 1, ONBOARDING_STEPS.length)} of {ONBOARDING_STEPS.length}
          </Text>
        </View>

        <View style={styles.progressTrack}>
          {ONBOARDING_STEPS.map((item, index) => (
            <View
              key={item}
              style={[
                styles.progressDot,
                index <= currentIndex && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.iconCircle}>
          <IconSymbol name={current.icon} size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>

        {statusMessage ? (
          <Text selectable style={styles.statusMessage}>
            {statusMessage}
          </Text>
        ) : null}

        <View style={styles.stepBody}>{renderStep()}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={colors.pillActiveText} />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={styles.secondaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
  indented,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  indented?: boolean;
}) {
  return (
    <View style={[styles.switchRow, indented && styles.switchRowIndented]}>
      <Text style={indented ? styles.switchLabelSmall : styles.switchLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.background}
      />
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: spacing.xxl,
  },
  topRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  hidden: {
    opacity: 0,
  },
  stepCounter: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  progressTrack: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xxl,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
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
  },
  statusMessage: {
    color: colors.textMuted,
    backgroundColor: colors.brandSubtle,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.lg,
    lineHeight: 20,
  },
  stepBody: {
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  valueList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  valueItem: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  cityRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cityInput: {
    flex: 1,
  },
  stateInput: {
    width: 78,
    textAlign: "center",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.dark,
    backgroundColor: colors.dark,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: colors.darkForeground,
  },
  switchGroup: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  switchRowIndented: {
    marginLeft: spacing.lg,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  switchLabelSmall: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  summaryList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  summaryValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
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
  secondaryButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  secondaryButtonText: {
    color: colors.text,
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
