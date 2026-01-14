# HappiTime Monorepo

HappiTime is a Supabase-backed happy-hour platform with:
- `apps/web`: Next.js client portal (venue owners/admins)
- `apps/mobile`: Expo React Native consumer app
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

## Commands
- Web dev: `npm run dev:web`
- Mobile dev: `npm run dev:mobile`
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

