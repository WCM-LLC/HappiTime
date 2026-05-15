export const ONBOARDING_VERSION = 1;

export const ONBOARDING_STEPS = [
  "welcome",
  "location",
  "preferences",
  "notifications",
  "profile",
  "complete",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingPermissionStatus = "undetermined" | "granted" | "denied";

export type OnboardingNotificationPreferences = {
  notifications_push: boolean;
  notifications_happy_hours: boolean;
  notifications_venue_updates: boolean;
  notifications_friend_activity: boolean;
  notifications_product: boolean;
};

export type OnboardingCompletionInput = OnboardingNotificationPreferences & {
  display_name?: string | null;
  home_city?: string | null;
  home_state?: string | null;
  home_lat?: number | null;
  home_lng?: number | null;
  interests: string[];
  location_enabled: boolean;
  location_permission_status?: OnboardingPermissionStatus | null;
  notifications_permission_status?: OnboardingPermissionStatus | null;
};

export const INTEREST_OPTIONS = [
  { value: "happy_hours", label: "Happy hours" },
  { value: "cocktails", label: "Cocktails" },
  { value: "beer", label: "Beer" },
  { value: "wine", label: "Wine" },
  { value: "brunch", label: "Brunch" },
  { value: "coffee", label: "Coffee" },
  { value: "date_night", label: "Date night" },
  { value: "casual_dining", label: "Casual dining" },
  { value: "live_music", label: "Live music" },
  { value: "sports_bars", label: "Sports bars" },
  { value: "family_friendly", label: "Family-friendly" },
  { value: "late_night", label: "Late night" },
] as const;

const STEP_SET = new Set<string>(ONBOARDING_STEPS);
const INTEREST_SET = new Set<string>(INTEREST_OPTIONS.map((option) => option.value));

export function normalizeOnboardingStep(value: unknown): OnboardingStep {
  return typeof value === "string" && STEP_SET.has(value)
    ? (value as OnboardingStep)
    : "welcome";
}

export function nextOnboardingStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)];
}

export function previousOnboardingStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.max(index - 1, 0)];
}

export function normalizeInterests(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => INTEREST_SET.has(value))));
}
