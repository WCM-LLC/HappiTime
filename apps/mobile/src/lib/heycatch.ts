import type { User } from "@supabase/supabase-js";
import { analytics, type HeyCatchProperties } from "./heycatchSdk";
import { createScreenViewTracker } from "./screenViewTracker";

// Thin, fault-tolerant wrappers around the HeyCatch SDK for the mobile app.
// `analytics.init` itself lives at module scope in App.tsx (the install guide
// requires the entry file); everything here is a no-op until that has run.
//
// Every call is wrapped: analytics is best-effort by construction and must
// never turn a successful sign-in, sign-out or onboarding into a crash.
//
// What NOT to add here: taps and screen views. <HeyCatchProvider> autocaptures
// touches, and screens go through `reportScreen` (AppNavigator and the
// <ScreenView> gates) — hand-instrumenting either double-counts.

/**
 * Tie this device's anonymous activity to the signed-in user, by the stable
 * Supabase user id ONLY — never email, name or any other personal property.
 *
 * HeyCatch has no way to delete a person's data, and identify events keep a
 * copy of whatever properties they carried. Account deletion (delete-account)
 * removes our side; the bare id left at HeyCatch then points at nothing. Send
 * email or name here and the privacy policy's 30-day removal promise breaks.
 * `signup_date` is a timestamp, set-once so a later sign-in cannot move it.
 */
export function identifyUser(user: User): void {
  try {
    analytics.setIdentity(
      user.id,
      undefined,
      user.created_at ? { signup_date: user.created_at } : undefined
    );
  } catch {
    /* analytics must never break the app */
  }
}

/** Call on sign-out so the next person on this device starts anonymous. */
export function clearIdentity(): void {
  try {
    analytics.resetIdentity();
  } catch {
    /* analytics must never break the app */
  }
}

/** Report the screen the user is now on. Route name only — never params. */
export function trackScreenView(name: string): void {
  try {
    analytics.trackScreen(name);
  } catch {
    /* analytics must never break the app */
  }
}

/**
 * One app-wide screen reporter, shared by AppNavigator and the gate screens
 * App.tsx renders outside it (pre-feed onboarding, sign-in, onboarding,
 * handle capture). Sharing it means "skip repeats of the same name" holds
 * across the hand-off between the two. Feed it the current screen name.
 */
export const reportScreen = createScreenViewTracker(trackScreenView);

/**
 * Report a business outcome autocapture cannot see (e.g. onboarding finished).
 * Not for taps or screen views.
 */
export function trackOutcome(event: string, properties?: HeyCatchProperties): void {
  try {
    analytics.trackEvent(event, properties);
  } catch {
    /* analytics must never break the app */
  }
}
