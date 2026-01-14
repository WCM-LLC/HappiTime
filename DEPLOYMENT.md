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

## Mobile (Expo)
- Set env vars from `ENV.md`.
- Ensure deep links are configured for magic links (scheme + redirect URLs).
- Build using EAS if desired (`apps/mobile/eas.json`).

