# Deployment

## Supabase
- Add your migrations to `supabase/migrations/`.
- In CI/CD, run `supabase db push` against the target project.

GitHub Actions (DB deploy workflow) expects:
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

## Web (Next.js)
- Set env vars from `ENV.md` in your hosting provider.
- Configure Supabase Auth redirect URLs:
  - `https://<your-domain>/auth/callback`
- For Vercel billing setup, set the Stripe server-only env vars in the target
  environment, redeploy, then configure the Stripe webhook endpoint:
  `https://<your-domain>/api/stripe/webhook`
  with `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, and `invoice.payment_failed`.
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
