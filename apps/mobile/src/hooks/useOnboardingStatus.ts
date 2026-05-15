import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import {
  ONBOARDING_VERSION,
  normalizeInterests,
  normalizeOnboardingStep,
  type OnboardingCompletionInput,
  type OnboardingStep,
} from "../onboarding/state";

type LocalOnboardingState = {
  completed?: boolean;
  completedAt?: string;
  step?: OnboardingStep;
};

type RemoteOnboardingRow = {
  onboarding_completed_at?: string | null;
  onboarding_step?: string | null;
};

type OnboardingState = {
  loading: boolean;
  hasCompletedOnboarding: boolean;
  step: OnboardingStep;
  error: string | null;
};

const defaultState: OnboardingState = {
  loading: true,
  hasCompletedOnboarding: false,
  step: "welcome",
  error: null,
};

const storageKey = (userId: string) =>
  `happitime:onboarding:v${ONBOARDING_VERSION}:${userId}`;

const normalizeText = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStateCode = (value?: string | null) => {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase().slice(0, 2) : null;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to save onboarding.";

async function readLocalOnboarding(userId: string): Promise<LocalOnboardingState | null> {
  const value = await AsyncStorage.getItem(storageKey(userId));
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as LocalOnboardingState;
    return {
      completed: parsed.completed === true,
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined,
      step: normalizeOnboardingStep(parsed.step),
    };
  } catch {
    return null;
  }
}

async function writeLocalOnboarding(userId: string, state: LocalOnboardingState) {
  await AsyncStorage.setItem(
    storageKey(userId),
    JSON.stringify({
      ...state,
      step: normalizeOnboardingStep(state.step),
    })
  );
}

export function useOnboardingStatus(session: Session | null) {
  const userId = session?.user?.id ?? null;
  const [state, setState] = useState<OnboardingState>(defaultState);

  const load = useCallback(async () => {
    if (!userId) {
      setState({
        loading: false,
        hasCompletedOnboarding: false,
        step: "welcome",
        error: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    const local = await readLocalOnboarding(userId);

    try {
      const { data, error } = await (supabase as any)
        .from("user_preferences")
        .select("onboarding_completed_at, onboarding_step")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      const remote = data as RemoteOnboardingRow | null;
      const hasCompletedOnboarding =
        Boolean(remote?.onboarding_completed_at) || local?.completed === true;

      setState({
        loading: false,
        hasCompletedOnboarding,
        step: normalizeOnboardingStep(remote?.onboarding_step ?? local?.step),
        error: null,
      });
    } catch (error) {
      setState({
        loading: false,
        hasCompletedOnboarding: local?.completed === true,
        step: normalizeOnboardingStep(local?.step),
        error: `Using local onboarding state: ${getErrorMessage(error)}`,
      });
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProgress = useCallback(
    async (step: OnboardingStep) => {
      if (!userId) return { error: new Error("Not signed in.") };
      const normalizedStep = normalizeOnboardingStep(step);
      await writeLocalOnboarding(userId, { completed: false, step: normalizedStep });
      setState((prev) => ({ ...prev, step: normalizedStep }));

      const { error } = await (supabase as any)
        .from("user_preferences")
        .upsert(
          {
            user_id: userId,
            onboarding_step: normalizedStep,
            onboarding_version: ONBOARDING_VERSION,
          },
          { onConflict: "user_id" }
        );

      if (error) {
        setState((prev) => ({ ...prev, error: `Progress saved locally: ${error.message}` }));
      }

      return { error };
    },
    [userId]
  );

  const completeOnboarding = useCallback(
    async (input: OnboardingCompletionInput) => {
      if (!userId) {
        return { error: new Error("Not signed in."), usedLocalFallback: false };
      }

      const completedAt = new Date().toISOString();
      const localState = {
        completed: true,
        completedAt,
        step: "complete" as OnboardingStep,
      };
      await writeLocalOnboarding(userId, localState);

      const preferencePayload = {
        user_id: userId,
        home_city: normalizeText(input.home_city),
        home_state: normalizeStateCode(input.home_state),
        home_lat: input.home_lat ?? null,
        home_lng: input.home_lng ?? null,
        interests: normalizeInterests(input.interests),
        location_enabled: input.location_enabled,
        location_permission_status: input.location_permission_status ?? null,
        notifications_permission_status: input.notifications_permission_status ?? null,
        notifications_push: input.notifications_push,
        notifications_happy_hours: input.notifications_happy_hours,
        notifications_venue_updates: input.notifications_venue_updates,
        notifications_friend_activity: input.notifications_friend_activity,
        notifications_product: input.notifications_product,
        default_checkin_privacy: "private",
        onboarding_completed_at: completedAt,
        onboarding_step: "complete",
        onboarding_version: ONBOARDING_VERSION,
      };

      const errors: string[] = [];
      const { error: preferencesError } = await (supabase as any)
        .from("user_preferences")
        .upsert(preferencePayload, { onConflict: "user_id" });

      if (preferencesError) {
        errors.push(preferencesError.message);
      }

      const displayName = normalizeText(input.display_name);
      if (displayName) {
        const { error: profileError } = await (supabase as any)
          .from("user_profiles")
          .upsert(
            {
              user_id: userId,
              display_name: displayName,
              updated_at: completedAt,
            },
            { onConflict: "user_id" }
          );

        if (profileError) {
          errors.push(profileError.message);
        }
      }

      setState({
        loading: false,
        hasCompletedOnboarding: true,
        step: "complete",
        error: errors.length > 0 ? `Onboarding saved locally: ${errors.join("; ")}` : null,
      });

      return {
        error: errors.length > 0 ? new Error(errors.join("; ")) : null,
        usedLocalFallback: errors.length > 0,
      };
    },
    [userId]
  );

  const resetOnboarding = useCallback(async () => {
    if (!userId) return { error: new Error("Not signed in.") };
    await AsyncStorage.removeItem(storageKey(userId));
    const { error } = await (supabase as any)
      .from("user_preferences")
      .upsert(
        {
          user_id: userId,
          onboarding_completed_at: null,
          onboarding_step: "welcome",
          onboarding_version: ONBOARDING_VERSION,
        },
        { onConflict: "user_id" }
      );
    setState({
      loading: false,
      hasCompletedOnboarding: false,
      step: "welcome",
      error: error ? `Onboarding reset locally: ${error.message}` : null,
    });
    return { error };
  }, [userId]);

  return {
    ...state,
    reload: load,
    saveProgress,
    completeOnboarding,
    resetOnboarding,
  };
}
