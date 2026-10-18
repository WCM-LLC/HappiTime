import { analytics, type HeyCatchProperties } from "@heycatch/sdk";

/**
 * Report a business outcome to HeyCatch — something autocapture cannot see,
 * like a completed registration. Best-effort by construction: the SDK no-ops
 * before init and during SSR, and the catch means an analytics fault can never
 * turn a successful submission into a failed-looking one.
 *
 * Not for pageviews or clicks — autocapture already sends those, and
 * hand-instrumenting them double-counts.
 */
export function trackOutcome(event: string, properties?: HeyCatchProperties): void {
  try {
    analytics.trackEvent(event, properties);
  } catch {
    /* analytics must never break the page */
  }
}
