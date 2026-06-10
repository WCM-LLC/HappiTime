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
| `send-venue-digest` edge function | ⚠️ deployed v1 **timed out**; fixed in code — **redeploy** (Step 1b) |
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

# 1b. Redeploy send-venue-digest to ship the timeout fix (scoping to claimed venues).
supabase functions deploy send-venue-digest --project-ref ujflcrjsiyhofnomurco

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

### ✅ `send-venue-digest` timeout (HTTP 504, ~160 s) — FIXED in this PR (redeploy to apply)
**Symptom (before):** the first prod run returned `504` after ~160 s (edge-function
wall-clock limit).
**Root cause:** `send-venue-digest/index.ts` looped over **every** `status='published'`
venue with a non-null `checkin_secret` (~174) — one serial `org_members` lookup each —
even though only venues whose org has an owner/manager can receive a digest. Phase 1
gave *all* venues a `checkin_secret` default, so the loop fanned out over the whole
directory. (A missing `RESEND_API_KEY` was **not** the cause — the code skips email
cleanly when unset.)
**Fix:** a pure `venuesToProcess()` helper (`logic.ts`) scopes the loop to venues whose
org has an owner/manager, fetched once up front. Verified against prod: this collapses
the processed set from **174 → 3** claimed venues. Output-preserving — the other 171
were already skipped inside the loop.
**Action required:** redeploy the function for the fix to take effect:
`supabase functions deploy send-venue-digest --project-ref ujflcrjsiyhofnomurco`.
**Possible future hardening (not needed at pilot scale):** add an `AbortController`
timeout to the Resend `fetch` and bounded-concurrency sends if claimed venues grow large.

## Notes

- The digest cron fires **hourly** but the function self-guards to **6 AM CT**
  (DST-safe, in-function) — a manual off-hours invoke is a no-op by design, so real
  verification is the next 6 AM run after the redeploy (Step 1b).
- Phases 2 (`/v/*` Universal Links) and 5 (Insider Attribution) are already merged
  and live; Phase 2's native intent filter rides the next store build.
