import type { User } from "@supabase/supabase-js";
import { analytics, type HeyCatchProperties } from "@heycatch/sdk";

// Thin, fault-tolerant wrappers around the HeyCatch SDK for the mobile app.
// `analytics.init` itself lives at module scope in App.tsx (the install guide
// requires the entry file); everything here is a no-op until that has run.
//
// Every call is wrapped: analytics is best-effort by construction and must
// never turn a successful sign-in, sign-out or onboarding into a crash.
//
// What NOT to add here: taps and screen views. <HeyCatchProvider> autocaptures
// touches and AppNavigator reports screens — hand-instrumenting either
// double-counts.

/**
 * Tie this device's anonymous activity to the signed-in user. The id is the
 * stable Supabase user id — never an email or a token. Email and name go in
 * the properties (that is what the dashboard displays); `signup_date` is
 * set-once so a later sign-in cannot move it.
 */
export function identifyUser(user: User): void {
  try {
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const rawName = metadata.full_name ?? metadata.name;
    const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : undefined;
    analytics.setIdentity(
      user.id,
      {
        ...(user.email ? { email: user.email } : {}),
        ...(name ? { name } : {}),
      },
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
