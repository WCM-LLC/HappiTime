// Centralised feature flags for MVP-stage features that are stubbed out.
// A flag is enabled when its backing env var is set (or hardcoded to true once the infra lands).
// Server-side only — NEXT_PUBLIC_ vars are also accessible on the client.

export const featureFlags = {
  /** Venue search via NEXT_PUBLIC_SEARCH_API_URL. Returns empty results when disabled. */
  search: !!process.env.NEXT_PUBLIC_SEARCH_API_URL,

  /** Venue recommendations via NEXT_PUBLIC_RECOMMENDATIONS_API_URL. Returns empty results when disabled. */
  recommendations: !!process.env.NEXT_PUBLIC_RECOMMENDATIONS_API_URL,

  /** Web push notifications. Stub — set NEXT_PUBLIC_WEB_PUSH_ENABLED=true once FCM/VAPID is wired. */
  webPush: process.env.NEXT_PUBLIC_WEB_PUSH_ENABLED === 'true',
} as const;
