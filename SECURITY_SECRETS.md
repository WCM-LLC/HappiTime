## Secrets handling and rotation — HappiTime

This file explains how to remove secrets from source and inject them securely for local dev, CI, EAS builds and native iOS targets.

1) What we changed
- Removed `SUPABASE_ANON_KEY` from `apps/ios_mobile/HappiTimeApp/Info.plist` and replaced the committed anon key in `apps/mobile/.env` with a redacted placeholder. Do NOT restore the secret into the repo.

2) Set secrets for EAS builds (recommended)
- Create the secret in EAS (EAS CLI):

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<your-anon-key>"
eas secret:create --name EXPO_PUBLIC_MAPS_API_KEY --value "<your-google-maps-key>"
```

- Use the secret in build-time by configuring your `eas.json` or environment used by `eas build`. Expo's config loading in this repo reads environment variables via `app.config.js` / `process.env`.

3) Set secrets for GitHub Actions / CI
- In GitHub repository settings -> Secrets -> Actions add the same secrets, e.g. `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_MAPS_API_KEY`.
- Example workflow snippet to make secrets available to build steps:

```yaml
env:
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}
  EXPO_PUBLIC_MAPS_API_KEY: ${{ secrets.EXPO_PUBLIC_MAPS_API_KEY }}

steps:
  - name: Install
    run: npm ci
  - name: Build (EAS)
    run: eas build --platform ios
    env:
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}
```

4) Local macOS / Xcode development
- For native iOS debugging, set the environment variable in the Xcode scheme (Product → Scheme → Edit Scheme → Run → Arguments → Environment Variables) with key `SUPABASE_ANON_KEY` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` depending on which code path you need.
- Alternatively, use a local `.env` (never commit) or `direnv` for local dev.

5) How AppConfig reads secrets in this repo
- `AppConfig.load()` looks in `ProcessInfo.processInfo.environment` first, then `Info.plist` (see `apps/ios_mobile/HappiTimeApp/Core/Config/AppConfig.swift`). This means CI and Xcode env vars take precedence over Info.plist values.

6) Rotating exposed keys (Supabase anon key & Google API key)
- Supabase (anon key):
  - Go to Supabase dashboard → Project → Settings → API → `Service Role` / `anon` keys area.
  - Generate a new anon key (or rotate keys if the dashboard exposes rotate). After rotation, update your EAS/CI secrets with the new value and redeploy builds.
  - Immediately remove old key usage and invalidate the old key if the dashboard allows it.

- Google Maps / API key:
  - Go to Google Cloud Console → APIs & Services → Credentials → Create new API key.
  - Restrict key usage (HTTP referrers or iOS bundle id and bundle identifier restrictions). Update your EAS/CI secrets and revoke the old key.

7) Removing secret from git history (optional but recommended)
- Rotating keys is the fastest mitigation. If you must purge history, use a tool like `git filter-repo` or `git-filter-branch` — follow their docs carefully. Example (dangerous, rewrite history):

```bash
# recommended: install git-filter-repo first
git filter-repo --path apps/mobile/.env --invert-paths
# Push with force to remote and coordinate with team
git push --force
```

8) Validation checklist after rotation
- Update EAS secrets and CI secrets.
- Rebuild and re-run smoke tests (auth flows, magic-link, OAuth).
- Confirm mobile app can bootstrap session (AppStartup logs should show session restore or route to auth without API errors).

If you want, I can prepare a GitHub Actions snippet or `eas` commands inside a small `scripts/` helper — tell me which CI you use and I will add it.
