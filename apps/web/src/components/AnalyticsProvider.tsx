'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { createClient } from '@/utils/supabase/client';
import { flushAnalytics, identifyUser } from '@/services/analytics';

/**
 * Initializes the analytics SDK the provider adapter in services/analytics.ts
 * forwards to. Self-sufficient client component: resolves the session user via
 * the browser Supabase client (RootLayout is intentionally static). With the
 * env vars unset this renders nothing, initializes nothing, and makes zero
 * network calls — analytics must never block or break the console.
 */
export default function AnalyticsProvider() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER !== 'posthog') return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    const w = window as unknown as { posthog?: typeof posthog };
    if (w.posthog) return;

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: true,
      persistence: 'localStorage+cookie',
    });
    w.posthog = posthog; // what the adapter looks for
    flushAnalytics(); // drain the offline queue accumulated pre-init

    // Tie events to the Supabase user id (ids only — no PII beyond email trait).
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) identifyUser({ id: user.id, email: user.email ?? undefined });
    });
  }, []);
  return null;
}
