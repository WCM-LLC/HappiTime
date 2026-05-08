# import-places — operator guide

Edge function that enriches venue rows from Google Places and uploads photos to Cloudinary. Designed to be safe to re-run: it never overwrites verified venues.

## What it does

For each unverified venue (`is_verified = false`) whose `places_next_sync_at` is past or null, the function:

1. Looks the venue up in Google Places (by `places_id` if known, otherwise by name + address).
2. Fills in missing fields: `address`, `city`, `state`, `zip`, `phone`, `website`, `lat`, `lng` — only when the existing value is empty (defensive).
3. Updates `tags` and `price_tier` from the Places response (these always overwrite — that's why the verified flag exists).
4. Wipes existing Google-Places-sourced photos for the venue and uploads up to 6 fresh ones to Cloudinary.
5. Marks the row `places_status = 'success'` and schedules `places_next_sync_at` 30 days out.

## What it never does

- Touch any venue with `is_verified = true`. The `SELECT` in the function filters them out, and there's an in-loop defense check.
- Overwrite a field on a verified venue that's listed in `data_locked_fields`. A trigger on the `venues` table physically rejects those updates.

## Running it manually

You need two values:

- **Anon JWT** — public, the same one your apps use. Find it in Supabase Dashboard → Project Settings → API.
- **`x-places-token`** — server secret, fetched via the `get_places_job_token()` RPC.

```bash
# Get the places token (run from anywhere with Supabase MCP / dashboard SQL editor):
# SELECT public.get_places_job_token();

PROJECT_REF=ujflcrjsiyhofnomurco
ANON_JWT=<paste anon JWT>
PLACES_TOKEN=<paste from get_places_job_token()>

curl -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/import-places?limit=5" \
  -H "Authorization: Bearer ${ANON_JWT}" \
  -H "x-places-token: ${PLACES_TOKEN}" \
  -H "Content-Type: application/json"
```

Expected response shape:

```json
{
  "processed": 5,
  "success": 5,
  "failed": 0,
  "skipped": 0,
  "verified_skipped": 0
}
```

`verified_skipped > 0` would indicate the in-loop defense fired (a row was verified between `SELECT` and the inner check). Normal value is 0.

Optional query params:

- `?limit=N` — process up to N venues (default and cap = `PLACES_BATCH_LIMIT`, currently 5).
- `?debug=1` — return the first DB-update error inline instead of incrementing the failure counter.

## Scheduled run (production)

The function is invoked automatically every 30 minutes via `pg_cron`:

```
cron.job: import-places
schedule: */30 * * * *
command:  SELECT public.invoke_places_import();
```

`public.invoke_places_import()` reads the places token via `get_places_job_token()` and posts to the edge function with `pg_net.http_post`. A sibling job (`geocode-venues`, every 10 min) handles geocoding via `public.invoke_geocode_venues()`.

A daily prune job (`prune_cron_logs_daily`, runs `17 3 * * *`) trims `cron.job_run_details` and `net._http_response` entries older than 14 days so neither table grows unbounded. Implemented by `public.prune_cron_logs()`.

Pause / resume the schedule:

```sql
UPDATE cron.job SET active = false WHERE jobname = 'import-places';
UPDATE cron.job SET active = true  WHERE jobname = 'import-places';
```

Inspect recent runs:

```sql
SELECT runid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'import-places')
ORDER BY start_time DESC
LIMIT 20;
```

Inspect the resulting HTTP requests sent by `pg_net`:

```sql
SELECT id, status_code, content::text
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
```

## Where to monitor errors

1. **Database side** — what each venue saw:

   ```sql
   SELECT name, places_status, places_attempts,
          LEFT(places_last_error, 200) AS error_preview,
          places_next_sync_at
   FROM public.venues
   WHERE is_verified = false
     AND places_status IN ('pending','failed')
   ORDER BY updated_at DESC
   LIMIT 20;
   ```

2. **Edge function logs** — Supabase Dashboard → Edge Functions → `import-places` → Logs.
3. **Cloudinary** — Cloudinary Console → Media Library / Reports for upload activity, and Settings → Add-ons for moderation status.

## Common failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| `places_last_error` contains `"You don't have an active subscription for Google AI Video Moderation"` | Cloudinary upload preset has the moderation add-on enabled, account doesn't subscribe | In Cloudinary → Settings → Upload → Upload presets → `happitime_venue_media`, remove the moderation add-on or subscribe to it |
| `"Places token not configured."` (HTTP 500) | `get_places_job_token()` returns null | Verify the token is configured on the project (`places_job_token` setting) |
| `"Invalid places token."` (HTTP 401) | Mismatch between `x-places-token` header and the configured token | Re-fetch via `SELECT public.get_places_job_token();` |
| `"Max attempts reached."` | Venue has retried 4× and still fails. `places_status='failed'`, no further retries | Investigate the underlying error in `places_last_error`. To retry: `UPDATE venues SET places_status='pending', places_attempts=0, places_next_sync_at=NULL WHERE id=...` |
| Function times out from curl | Function takes longer than your client timeout (each invocation is ~5s/venue × `limit`). The function still completes server-side | Lower `limit`, or trust the eventual completion and check DB state afterward |

## Data protection model

The full pattern lives in the migration `data_protection_verified_flags_and_staging`. In short:

- `venues.is_verified = TRUE` means "this row is curated. Do not touch."
- `venues.data_locked_fields = '{name, phone, ...}'` lists fields whose values cannot change on verified rows. A `BEFORE UPDATE` trigger raises if anything tries.
- `reference_snapshots` + `venues_snapshot` + `happy_hour_windows_snapshot` keep point-in-time copies. To capture: `SELECT public.capture_reference_snapshot('label', 'notes')`. To roll back: `SELECT public.restore_venue_from_snapshot('<snapshot-id>', '<venue-id>')`.
- `staging_venues` / `staging_happy_hour_windows` exist for any future bulk pull that needs human review before promotion. `import-places` doesn't use them — it writes directly to unverified rows, which is acceptable because verified rows are filtered.

## Verifying / unverifying a row

```sql
-- Mark a venue as verified (locks it from future pulls)
UPDATE public.venues
   SET is_verified = TRUE, verified_at = NOW(), verified_by = auth.uid()
 WHERE id = '<venue-uuid>';

-- Lock specific fields
UPDATE public.venues
   SET data_locked_fields = ARRAY['name','address','phone','tags','price_tier']
 WHERE id = '<venue-uuid>';

-- Unlock to allow a re-enrichment
UPDATE public.venues
   SET is_verified = FALSE, places_next_sync_at = NULL, places_status = 'pending'
 WHERE id = '<venue-uuid>';
```
