# Pilot Deploy Runbook (Phase 1 — check-in spine)

**Prod Supabase project ref:** `ujflcrjsiyhofnomurco`
**Last verified against prod:** 2026-06-10

Migrations auto-apply to prod on merge to `master` (Supabase branching). Edge
**functions do not** — they must be deployed explicitly. This runbook covers the
operational steps that a merge does not perform.

## Verified prod state (2026-06-10)

| Item | Status |
|---|---|
| Phase 1 tables (`checkins`, `round_redemptions`, `venue_flags`) | ✅ present |
| Venue columns (`checkin_secret`, `staff_token`, `geofence_radius_m`) | ✅ present |
| Digest cron `send-venue-digest-hourly` + seeded `digest_job_tokens` | ✅ scheduled |
| `send-venue-digest` edge function | ⚠️ deployed but **timing out** — see Known Issues |
| Phase 5 tables + both summary views (incl. `super_user_traffic_summary`) | ✅ present |
| **`verify-checkin` edge function** | ❌ **NOT deployed** |
| `RESEND_API_KEY` secret | ❓ confirm (Step 2) |

## Deploy steps

Run with prod credentials. The project ref is `ujflcrjsiyhofnomurco`.

```bash
# 0. Prereq (once)
supabase login

# 1. Deploy verify-checkin — THE critical gap. In-app check-in 404s until this ships.
#    No config.toml entry → defaults to verify_jwt=true (correct: check-in is authed).
supabase functions deploy verify-checkin --project-ref ujflcrjsiyhofnomurco

# 2. Confirm the Resend secret (the digest needs it; SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
#    are auto-injected by the edge runtime and must NOT be set manually).
supabase secrets list --project-ref ujflcrjsiyhofnomurco | grep -i resend
#    If RESEND_API_KEY is missing:
supabase secrets set RESEND_API_KEY=re_xxxxx --project-ref ujflcrjsiyhofnomurco
#    RESEND_FROM is optional; defaults to "HappiTime <noreply@happitime.biz>".

# 3. Smoke-test verify-checkin is live — expect HTTP 401 (deployed, JWT required), NOT 404.
curl -i -X POST https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/verify-checkin
```

## Device verification (after Step 1)

1. Run the app; go to a pilot venue inside the geofence.
2. Tap **Earn a Stamp** / **Check In**, enter today's code (shown in the console
   header, the `/staff/{staff_token}` URL, or the 6 AM digest subject).
3. Confirm the stamp animation + progress ("3 of 5").
4. Repeat to 5 visits → confirm the "round on the house" redemption (re-enter
   today's code to confirm).
5. Confirm GPS-fallback (after 2 failed code attempts) is capped at 2 lifetime
   per venue and flags `venue_flags`.

## Known issues / blockers

### ⚠️ `send-venue-digest` times out (HTTP 504, ~160 s) — digest is currently unreliable
**Symptom:** the most recent prod run returned `504` after ~160 s (edge-function
wall-clock limit).
**Root cause:** `supabase/functions/send-venue-digest/index.ts` selects **every**
`status='published'` venue with a non-null `checkin_secret` (line ~77–90) and
processes them in a **sequential loop** (~7 DB round-trips + 1 Resend call each).
Phase 1 added `checkin_secret` with a default to *all* venues, so the digest fans
out over the entire directory (~174 venues) → exceeds the time limit.
A missing `RESEND_API_KEY` is **not** the cause (line ~209 skips email cleanly
when unset).
**Recommended fix (small PR):**
- Scope the venue query to actual pilot venues (e.g. orgs with an active /
  `founding_pilot` check-in subscription, or a dedicated pilot flag) instead of
  all published venues.
- Bound the work: parallelize the per-venue sends with limited concurrency and add
  a timeout to each Resend `fetch`, so one slow/hung call can't stall the run.
- Until fixed, the hourly cron keeps retrying and timing out; the "0 emails sent"
  self-check may not fire if the function is killed before reaching it.

## Notes

- The digest cron fires **hourly** but the function self-guards to **6 AM CT**
  (DST-safe, in-function) — a manual off-hours invoke is a no-op by design, so real
  verification is the next 6 AM run (or fixing the timeout above and invoking at 6 AM CT).
- Phases 2 (`/v/*` Universal Links) and 5 (Insider Attribution) are already merged
  and live; Phase 2's native intent filter rides the next store build.
