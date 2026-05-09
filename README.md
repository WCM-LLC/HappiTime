# HappiTime Monorepo

HappiTime is a Supabase-backed happy-hour platform with:
- `apps/web`: Next.js client portal (venue owners/admins)
- `apps/mobile`: Expo React Native consumer app
- `apps/android`: Android-specific Expo app that reuses `apps/mobile` source
- `packages/shared-api`: shared, typed Supabase query helpers
- `packages/shared-env`: shared env parsing/validation
- `packages/shared-types`: shared Supabase DB types + domain aliases
- `supabase/`: local config, migrations, seeds

## Prereqs
- Node.js 20+
- npm (workspaces enabled)
- Docker Desktop (required for `supabase start` local DB)
- Supabase CLI (provided via `npm` dependency)

## Quickstart (local)
```powershell
npm install
npm run supabase:start
npm run supabase:reset
npm run dev:web
```

Mobile (in a separate terminal):
```powershell
npm run dev:mobile
```

Android app (in a separate terminal):
```powershell
npm run dev:android
```

## Mobile Dev Build (iOS)

The mobile app uses `react-native-maps` and `expo-notifications`, which are not supported in Expo Go and require a custom dev client build.

### First-time setup — build and install the dev client

```bash
eas build --profile development --platform ios
```

This runs a cloud build (~10–15 min) and produces an installable `.ipa`. Register your device when prompted, then install via the link sent to your browser.

### Starting the dev server

Once the dev client app is installed on your device:

```bash
npm run dev:mobile
```

Open the **HappiTime Development Build** app (not Expo Go). It will auto-discover the server if your phone and Mac are on the same Wi-Fi.

If it shows "No development servers found", tap **Enter URL manually** and enter the `exp://` URL shown in your terminal.

### Tunnel mode (different networks or mDNS issues)

```bash
npx expo start --tunnel
```

This creates a public URL that works across any network connection.

## Commands
- Web dev: `npm run dev:web`
- Mobile dev: `npm run dev:mobile`
- Android dev: `npm run dev:android`
- Android native run: `npm run android`
- Android Play build: `npm run build:android`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests: `npm test`
- Web build: `npm run build:web`

## Database (Supabase)
- Local start/stop: `npm run supabase:start` / `npm run supabase:stop`
- Reset (migrations + seed): `npm run supabase:reset`
- Push migrations to linked project: `npm run supabase:push`

Migrations live in `supabase/migrations/`. Seed data lives in `supabase/seed.sql`.

## Docs
- `ENV.md`
- `DB_SCHEMA.md`
- `RLS.md`
- `MIGRATIONS.md`
- `TESTING.md`
- `DEPLOYMENT.md`

## Assumptions (documented)
- Consumer app reads **public** listings (anon) for `published` venues/windows/menus.
- Client portal uses org membership + venue assignments for tenant isolation.
- Local Supabase Postgres major version is set to `15` in `supabase/config.toml`.
