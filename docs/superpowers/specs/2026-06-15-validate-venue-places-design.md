# validate-venue-places — Design

**Date:** 2026-06-15
**Status:** Approved (brainstorming) → ready for implementation plan
**Author:** Juan Williams + Claude

## Background

On 2026-06-13 two migrations were applied to prod via MCP but never committed
to git (recovered to the repo on 2026-06-15, PR #91):

- `20260613220102_add_venue_validation_infrastructure` — `venue_validation_log`
  audit table, `venues.places_validated_at`, `private.validate_job_tokens`,
  `get_validate_job_token()`.
- `20260613220157_add_validate_venues_wrapper_and_cron` — `invoke_validate_venues()`
  wrapper + hourly cron `validate-venue-places-hourly` (`37 * * * *`) that POSTs
  to the `validate-venue-places` edge function.

The cron has been firing hourly since 2026-06-13 and returning **404 NOT_FOUND**
every time: the `validate-venue-places` edge function it calls was never written
or deployed (confirmed via `net._http_response`; absent from `list_edge_functions`).
The DB scaffolding shipped; the worker never did. `venue_validation_log` is empty
and `places_validated_at` is null for every venue.

This spec defines the missing function so the existing cron starts doing real work.

## Purpose

Hourly, in small batches, detect venues whose stored address has drifted from
Google's canonical Places record. Log every check to an audit trail and flag
drifted venues for human review. **Detection + logging only** — no auto-correction,
no admin UI, no alerting.

## Scope

### In scope
- New edge function `supabase/functions/validate-venue-places/index.ts`.
- One companion migration adding `venues.needs_address_review`.
- `config.toml` declaration + deployment + commit.

### Out of scope (YAGNI)
- Auto-correcting venue addresses from Google's canonical value.
- Admin UI to review/clear flagged venues.
- Alerting / notifications on mismatch.
- Any change to the existing cron or wrapper (already live and correct).

## Companion migration

```sql
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS needs_address_review boolean NOT NULL DEFAULT false;
```

Set `true` when a check flags a mismatch, so a future admin view can surface
flagged venues with `WHERE needs_address_review`. Applied to prod via the normal
migration flow **and committed** (no more out-of-band drift).

## Function design

Mirrors two established local patterns:
- **Token auth + batch loop** from `geocode-venues`.
- **Places API v1 fetch-by-id** (`places.googleapis.com/v1`, field mask) from
  `import-places`, using the existing `GOOGLE_PLACES_API_KEY` secret.

### Environment
| Var | Source | Notes |
|-----|--------|-------|
| `SUPABASE_URL` | existing | |
| `SUPABASE_SERVICE_ROLE_KEY` | existing | service-role client, no session persistence |
| `GOOGLE_PLACES_API_KEY` | existing | same key `import-places` uses |
| `VALIDATE_BATCH_LIMIT` | new, default `25` | ~700 venues sweep over ~1 day at hourly cadence |

Throw on startup if any of the three required secrets are missing (mirrors
`geocode-venues`).

### Flow
1. **Auth.** Read `X-Validate-Token` header; compare to `get_validate_job_token()`
   RPC. Missing/empty → `401`; mismatch → `401`; RPC error → `500`.
2. **Select batch.** `venues` where `places_id is not null`, ordered
   `places_validated_at asc nulls first`, `limit VALIDATE_BATCH_LIMIT`.
3. **Per venue — fetch canonical address.** Places v1 Place Details by `places_id`
   with field mask `formattedAddress,addressComponents` (reuse `import-places`'
   request shape + key).
4. **Score.** Normalize both the stored address (`address, city, state, zip`) and
   Google's value: lowercase, strip punctuation, expand common abbreviations
   (St→Street, Ave→Avenue, Blvd→Boulevard, Rd→Road, Dr→Drive, Ste/Suite, etc.).
   Compare **street number + street name + zip** as token similarity in `[0,1]`.
   `mismatch = match_score < 0.7`.
5. **Persist.** Insert a `venue_validation_log` row
   (`venue_id, places_id, stored_address, google_address, match_score, mismatch`);
   `UPDATE venues SET places_validated_at = now(),
   needs_address_review = (needs_address_review OR mismatch)`.
6. **Return** `{ processed: N, mismatches: M }`.

### Error handling
| Condition | Action |
|-----------|--------|
| Google `NOT_FOUND` (stale/deleted place) | Flaggable: log row with `google_address=null`, `mismatch=true`, bump `places_validated_at` — the stale `places_id` needs review. |
| Transient (`OVER_QUERY_LIMIT`, HTTP 5xx) | Skip venue; **do not** bump `places_validated_at` (retries next hour). |
| Fatal config (`REQUEST_DENIED`, bad key) | Skip venue, count as error in response; do not bump. |
| Venue has no `places_id` | Never selected. |

### config.toml & deploy
Declare the function with `verify_jwt = false` (cron authenticates via the custom
`X-Validate-Token` header, not a JWT — same as `geocode-venues`). Deploy via
`deploy_edge_function`, then commit the source. The live cron picks it up on its
next `:37` firing with no further change.

## Testing

The only non-trivial logic is the pure normalize-and-score function; unit-test it
in isolation:
- `St` vs `Street`, `Ave` vs `Avenue` → high score (equivalence).
- Suite/unit noise (`Ste 200`) → does not by itself produce a mismatch.
- Different street number, same street → low score (`< 0.7`, flagged).
- Identical normalized address → `1.0`.
- Different zip → flagged.

The fetch + DB loop is thin glue over established patterns; covered by a smoke
check against a known venue during deploy verification rather than a heavy
integration test.

## Verification (post-deploy)
- Manually invoke once; confirm `200 { processed, mismatches }`.
- Confirm `net._http_response` for `validate-venue-places` flips from `404` to
  `200` on the next cron firing.
- Spot-check a `venue_validation_log` row and that `places_validated_at` advanced.
