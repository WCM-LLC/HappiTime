// Client instrumentation (Next.js 15.3+): runs once per browser session,
// before React hydrates — the single PostHog init point. Identity syncing
// lives in utils/supabase/client.ts (auth state changes); event helpers in
// services/analytics.ts forward to window.posthog.
//
// With the env vars unset this does nothing: analytics must never block or
// break the console (no dev-mode throw — the wizard's default violated that).
import posthog from 'posthog-js';
import { flushAnalytics } from '@/services/analytics';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER;

if (provider === 'posthog' && key && !(window as { posthog?: unknown }).posthog) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    capture_exceptions: true,
    capture_pageview: true,
    persistence: 'localStorage+cookie',
    debug: process.env.NODE_ENV === 'development',
  });
  (window as { posthog?: typeof posthog }).posthog = posthog; // adapter contract
  flushAnalytics(); // drain events queued before init
}
