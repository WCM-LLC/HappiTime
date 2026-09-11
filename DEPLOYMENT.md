# Deployment

## Supabase
- Add your migrations to `supabase/migrations/`.
- In CI/CD, run `supabase db push` against the target project.

GitHub Actions (DB deploy workflow) expects:
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

## Monitoring

Two scheduled tripwires watch production. Both fail the workflow run, which
notifies repo watchers through GitHub.

- **Uptime** (`.github/workflows/uptime.yml`, every ~10 min) — checks that
  PostgREST and GoTrue answer, and answer within 5s. Added after the
  2026-08-12 outage, when both hung for ~30 minutes while the Supabase
  dashboard still reported the project `ACTIVE_HEALTHY` and happitime.biz
  still served 200s from Vercel's cache. Nothing alerted; we found out when
  someone tried to log in.
  Needs `SUPABASE_PROJECT_REF` and **`SUPABASE_ANON_KEY`** (repository
  secrets). The anon key is already public — it ships in the mobile bundle and
  the web client — so it is a secret here only for tidiness, not secrecy.
- **Auth Health** (`.github/workflows/auth-health.yml`, daily) — checks for
  5xx on the email-auth endpoints, and that requested magic links convert.

When uptime trips, check <https://status.supabase.com> first. If the platform
is fine, the issue is project-specific and a restart from the project's
General settings is the usual fix.

## Web (Next.js)
- Set env vars from `ENV.md` in your hosting provider.
- Configure Supabase Auth redirect URLs:
  - `https://<your-domain>/auth/callback`
  - `https://<your-domain>/auth/recovery`
  - For HappiTime console production, include:
    - `https://happitime-console.vercel.app/auth/callback`
    - `https://happitime-console.vercel.app/auth/recovery`
    - `https://happitime-console.vercel.app/auth/callback**`
    - `https://happitime-console.vercel.app/auth/recovery**`
  - Do not rely on the bare console domain alone. Super User OAuth and magic
    links include `next` query parameters, so Supabase needs query-safe
    callback/recovery patterns; otherwise it can fall back to the project Site
    URL (`happitime.biz`).
- For Vercel billing setup, set the Stripe server-only env vars in the target
  environment, redeploy, then configure the Stripe webhook endpoint:
  `https://<your-domain>/api/stripe/webhook`
  with `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.paid`, and
  `invoice.payment_failed`.
- Use Stripe test-mode values first. The Basic, Featured, and Premium Stripe
  products should each have one active recurring monthly price.

## Mobile (Expo)
- Set env vars from `ENV.md`.
- Ensure deep links are configured for magic links (scheme + redirect URLs).
- Build using EAS if desired (`apps/mobile/eas.json`).

## Android (Expo / Google Play)
- Set env vars from `ENV.md`.
- Configure Supabase Auth redirect URLs with `happitime://auth/callback`.
- Enable the Supabase Google provider before testing "Continue with Google".
- Build with `npm run build:android` from the repo root.
- Upload the production `.aab` to the existing Play Console app with package
  `com.jwill7486.happitime.mobile`.
- Complete the Play Console Advertising ID declaration. This app blocks
  `com.google.android.gms.permission.AD_ID`, so answer "No" unless an ad or
  analytics SDK that uses advertising ID is added later.
