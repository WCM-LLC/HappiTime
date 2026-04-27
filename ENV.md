# Environment Variables

## Web (`apps/web`)
Copy `apps/web/.env.example` → `apps/web/.env.local`.

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)

Server-only (required for org invites + admin actions):
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS` — comma-separated list of admin email addresses

Optional (auth debug):
- `AUTH_DEBUG` — enable server-side auth logging (`true`/`false`)
- `NEXT_PUBLIC_AUTH_DEBUG` — enable client-side auth logging (`true`/`false`)
- `NEXT_PUBLIC_SITE_URL` — canonical site URL (used for auth redirects in production)

Optional (maps):
- `NEXT_PUBLIC_MAPS_PROVIDER` (`google` or `mapbox`)
- `NEXT_PUBLIC_MAPS_API_KEY`
- `NEXT_PUBLIC_MAPS_STYLE_ID` (Mapbox only)

Optional (event ingestion):
- `EVENTS_INGEST_API_KEY`
- `EVENTS_INGEST_RATE_LIMIT_PER_MIN`
- `EVENTS_INGEST_MAX_BATCH`
- `NEXT_PUBLIC_EVENTS_INGEST_URL`

Optional (search / recommendations — stubs; no backend wired yet):
- `NEXT_PUBLIC_SEARCH_API_URL`
- `NEXT_PUBLIC_RECOMMENDATIONS_API_URL`

Optional (media):
- `NEXT_PUBLIC_MEDIA_METADATA_TABLE` (`venue_media` or legacy `media_assets`)
- `NEXT_PUBLIC_MEDIA_CDN_BASE_URL`
- `NEXT_PUBLIC_MEDIA_PROVIDER`

Optional (analytics / error reporting):
- `NEXT_PUBLIC_ANALYTICS_PROVIDER`
- `NEXT_PUBLIC_ANALYTICS_DEBUG`
- `NEXT_PUBLIC_ERROR_REPORTING_PROVIDER`

## Directory (`apps/directory`)
Copy `apps/directory/.env.example` → `apps/directory/.env.local`.

Required (Supabase):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required (contact form email delivery):
- `SMTP_HOST` (SMTP server hostname)
- `SMTP_PORT` (SMTP server port, e.g. `587` or `465`)
- `SMTP_USER` (SMTP username)
- `SMTP_PASS` (SMTP password)

Recommended:
- `SMTP_FROM` (controlled sender address shown in outbound support emails; defaults to `SMTP_USER`)
- `SUPPORT_RECIPIENT_EMAIL` (support inbox recipient; defaults to `admin@happitime.biz`)
- `SMTP_SECURE` (`true`/`false`; defaults to `true` only when port is `465`)

Optional:
- `NEXT_PUBLIC_MAPS_API_KEY`
- `NEXT_PUBLIC_COMING_SOON` — set to `true` to show coming-soon page
- `NEXT_PUBLIC_GTM_ID` — Google Tag Manager container ID

## Mobile (`apps/mobile`)
Copy `apps/mobile/.env.example` → `apps/mobile/.env`.

Required:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)

Optional (maps):
- `EXPO_PUBLIC_MAPS_PROVIDER` (`google` or `mapbox`)
- `EXPO_PUBLIC_MAPS_API_KEY`

Note: `apps/mobile/app.config.js` reads `.env`/`.env.local` from the app root
or repo root to inject values into `expo.extra`. Restart Expo with `-c` after
changing env vars.
