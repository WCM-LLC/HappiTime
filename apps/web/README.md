# HappyHour Client Portal (Next.js + Supabase)

This is a *basic* client-facing web platform (MVP) so venue owners can:
- create an Organization (multi-location group)
- add Venues/Locations
- manage Happy Hour times
- manage structured menus (menus → sections → items)
- upload media (images, videos, PDFs) via Supabase Storage
- view starter analytics (event counts)

## Prereqs
- Node.js 18+ (or whatever Next.js requires on your machine)
- A Supabase project

## 1) Configure env vars
Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (primary public key)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (optional legacy alias)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, used for /api/events/ingest)

## 2) Create tables + policies
In Supabase Dashboard → SQL Editor, run:
- `supabase/sql/001_init.sql`
- `supabase/sql/002_storage_policies.sql`

Then apply migrations (recommended to keep schema aligned with the app):
```powershell
.\supabase.ps1 db push
```

## 2b) Database migrations (CLI + GitHub Actions)
For ongoing schema changes, add SQL migrations in `supabase/migrations/`.
The workflow in `.github/workflows/supabase-db-deploy.yml` applies them on push to `main`.
Set these GitHub Actions secrets:
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

If your default branch is not `main`, update the workflow trigger.

Local helper (no PATH changes):
```powershell
.\supabase.ps1 db push
```

Update/reinstall the local CLI:
1) Download the latest Windows archive from https://github.com/supabase/cli/releases/latest
2) Extract it into `.tools/supabase/` (replace `supabase.exe`)

Or use the helper script:
```powershell
.\supabase-update.ps1
```

## 3) Configure Auth (social login)
In Supabase Dashboard:
- Authentication → Providers: enable Google / Apple / Facebook / Twitter (X)
- Authentication → URL Configuration:
  - Site URL: `http://localhost:3000` (local)
  - Redirect URLs: include `http://localhost:3000/auth/callback`

## 4) Run locally
```bash
npm install
npm run dev
```

Then open http://localhost:3000

## 5) Event ingestion (for the user app)
POST to:
- `POST /api/events/ingest`
- Provide header: `x-api-key: <EVENTS_INGEST_API_KEY>`

Body example:
```json
{
  "org_id": "uuid",
  "venue_id": "uuid",
  "user_id": "uuid-or-null",
  "event_type": "view_venue",
  "meta": { "source": "app" }
}
```

## Notes
- Instagram is not a built-in Supabase OAuth provider. If you need “Login with Instagram”, use a third-party auth provider and connect it to Supabase (or treat Instagram as a data integration instead).
- Storage policies are permissive (MVP). Tighten them once your schema is stable.


