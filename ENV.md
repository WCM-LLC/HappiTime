# Environment Variables

## Web (`apps/web`)
Copy `apps/web/.env.example` → `apps/web/.env.local`.

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)

Server-only (required for org invites + admin actions):
- `SUPABASE_SERVICE_ROLE_KEY`

Optional (maps):
- `NEXT_PUBLIC_MAPS_PROVIDER` (`google` or `mapbox`)
- `NEXT_PUBLIC_MAPS_API_KEY`
- `NEXT_PUBLIC_MAPS_STYLE_ID` (Mapbox only)

Optional (event ingestion):
- `EVENTS_INGEST_API_KEY`
- `EVENTS_INGEST_RATE_LIMIT_PER_MIN`
- `EVENTS_INGEST_MAX_BATCH`
- `NEXT_PUBLIC_EVENTS_INGEST_URL`
- `NEXT_PUBLIC_EVENTS_INGEST_API_KEY`

Optional (media metadata table override):
- `NEXT_PUBLIC_MEDIA_METADATA_TABLE` (`venue_media` or legacy `media_assets`)

## Mobile (`apps/mobile`)
Copy `apps/mobile/.env.example` → `apps/mobile/.env`.

Required:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Optional (maps):
- `EXPO_PUBLIC_MAPS_PROVIDER` (`google` or `mapbox`)
- `EXPO_PUBLIC_MAPS_API_KEY`

Note: `apps/mobile/app.config.js` reads `.env`/`.env.local` from the app root
or repo root to inject values into `expo.extra`. Restart Expo with `-c` after
changing env vars.
