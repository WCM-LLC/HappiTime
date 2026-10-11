// Client instrumentation (Next.js 15.3+): runs once per browser session,
// before React hydrates — the single HeyCatch init point for happitime.biz.
//
// Deliberately bare, per the HeyCatch install guide: a static import at module
// scope, no `typeof window` guard and no once-flag (`init` is idempotent and a
// no-op during SSR), and the key inlined — it is a publishable key, not a
// secret. Do not move this into a component or a lazy chunk: nothing is queued
// before `init`, and the SDK must evaluate with the entry bundle to forward
// the reserved short-link paths (see the `/:l([a-z0-9])` rule in next.config.ts).
//
// Autocapture covers pageviews, clicks and route changes from here on, so do
// not hand-instrument those for HeyCatch. Business outcomes go through
// `analytics.trackEvent` at the point they happen.
import { analytics } from "@heycatch/sdk";

analytics.init({
  projectKey: "hck_pk_69puY7GnAEbkY1oa-6tm0d2OxsP10vj3",
  install: {
    framework: "nextjs",
    frameworkVersion: "15",
    agent: "claude-code",
  },
});
