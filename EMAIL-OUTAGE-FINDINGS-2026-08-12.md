# Transactional email is down across HappiTime — findings 2026-08-12

Investigated while preparing to flip `INTAKE_SELF_SERVE_ENABLED`. The flag is
blocked by this; the problem is much wider than intake.

## Summary

**No transactional email is being delivered from HappiTime, by any path.**
All three verified independently, with three separate causes.

| Path | Transport | Config state | Result |
|---|---|---|---|
| Console (`apps/web`) | `resend` npm pkg | `RESEND_API_KEY` **absent from every `happitime-console` env** | `getResend()` returns `null`; all sends skipped with a `console.warn` |
| Supabase edge functions | Resend REST API | `RESEND_API_KEY` **present but invalid** | Resend replies `401 validation_error — API key is invalid` |
| Directory contact form | SMTP (`SMTP_*`) | **no SMTP vars in any `happitime-directory` env** | `getSmtpConfig()` throws; route returns **500 to the visitor** |

> **Methodology note on the directory row.** An earlier reading of "no SMTP
> vars" was a *false negative* and was discarded: `apps/directory` has no local
> `.vercel` link, so `vercel env ls` run from that folder silently resolves to
> `happitime-console`. Re-checked by linking `happitime-directory` explicitly,
> confirming across all environments, then unlinking. The conclusion held, but
> the first method could not have established it.

### The contact form is the one users can see

The two Resend paths fail silently. The directory contact form does not — it
returns a 500 and shows *"We could not send your request right now. Please try
again shortly."* This is the public marketing site's only contact route, so
**every inbound enquiry through happitime.biz has been failing visibly**, which
for a venue-acquisition business is lost leads rather than a delayed email.

### Evidence

Supabase `function_logs`, 2026-08-12 11:00 UTC (the 6am Central digest run):

```
[send-venue-digest] Resend error for venue ea4bb434-…:
  {"statusCode":401,"name":"validation_error","message":"API key is invalid"}
```

5 venues attempted, 5 failures, one per venue. The console path produces no
error at all — `getResend()` returning `null` is indistinguishable from "no
mail was due".

## Affected surfaces

Console (`apps/web/src/utils/email.ts`) — all four are no-ops:
- `sendGuideSubmissionEmail`
- `sendVenueOwnerConfirmation`
- `sendIntakeReviewNotice`  ← what the intake flag depends on
- `sendIntakeDecisionEmail`

Edge functions — both 401:
- `send-venue-digest` (daily 6am code + stats email to venues)
- `send-friend-invite`

## Blast radius right now

Small in volume, not in meaning. The daily digest is the live casualty: 5
venues have silently not received their 6am email. Invite volume is near
zero (`org_invites` 2 all-time, most recent 2026-06-06; `pending_friend_invites`
0), so nobody is currently stuck on an undelivered invite — but any invite
sent today would vanish.

## Why it stayed invisible

Both failures are swallowed by design.

- `notifyIntakeReviewers` wraps its send in `try/catch` and logs, because the
  submission already committed and a mail failure shouldn't fail the request.
- `getResend()` returns `null` on a missing key rather than throwing.
- The digest cron reports success regardless: `cron.job_run_details` only
  records that pg_net **queued** the call, not what the function did with it.
  This is the same misleading-green signal noted during the 2026-08-12 incident.

A fallback that keeps the request path green while guaranteeing the outcome
never happens is the recurring shape of today's bugs — see also #159, where a
console link defaulted to a host attached to no Vercel project.

## How long has it been broken?

Unknown, and not determinable from inside the system:

- Supabase's logs API caps at 24 hours.
- There is no digest-send table in `public` to audit against.
- `cron.job_run_details` retains back to **2026-07-29** and shows
  `send-venue-digest-hourly` with **357 runs, 0 failed** — but that status
  only means pg_net queued the call, so every one of those greens is
  compatible with zero email delivered.

**Only Resend's own dashboard can date this authoritatively.**

One secondhand data point, flagged as such: a `resend-healthcheck` edge
function deployed earlier on 2026-08-12 (~16:19 UTC) carries a header comment
describing "the 8-day send-venue-digest outage". I did not write that comment
and do not know who did. It is consistent with everything measured here — the
401s, the DNS ages, the fact the key has since been replaced — so it is
probably right, but it is **a code comment, not a verified measurement**. Treat
~8 days as an estimate pending the dashboard.

---

## UPDATE 2026-08-13 03:55 UTC — the Resend credential is now valid

Re-armed that same (retired) healthcheck function briefly to query Resend's
read-only `GET /domains` endpoint from inside the edge runtime, which is the
only place the Supabase-held secret is readable. Result:

```
httpStatus : 200
verdict    : VALID — Supabase's Resend key authenticates
RESEND_FROM: HappiTime <noreply@happitime.biz>
domains    : happitime.biz  → verified
             nbufkc.com     → not_started
```

Three things follow:

1. **The Supabase edge-function key is fixed.** A different key is in place
   (36 chars, `re_VEB…N6Pf`) and it authenticates.
2. **`happitime.biz` is still a verified Resend sending domain**, so
   `noreply@happitime.biz` works and the `@zoraaba.resend.app` predefined
   address is *not* needed. No code change required for the from-address.
3. **The console key was also set** (Vercel `happitime-console`, Preview +
   Production) and the console redeployed at the same time, so it is live.
   Its validity was not separately confirmed — if it is the same key, it is
   valid.

**Still unproven end-to-end:** no digest has actually delivered yet. The 06:00
CT run on 2026-08-13 is the first real test, and the `digest-check` workflow at
13:00 UTC will report the outcome. Until then, "the key authenticates" is not
the same claim as "email is being delivered".

## To fix — in this order

1. **Check the Resend dashboard first, before minting anything:**
   - Is the existing key *revoked* or merely *rotated*? Different problems.
   - Is the `happitime.biz` sending domain still **verified**? A revoked key
     and a lapsed domain often travel together, and a fresh key against an
     unverified domain produces the exact same silence.
   - What is the last successful send? That dates the outage.
2. Mint a fresh key once the above is understood.
3. Set it in **both** stores — they are independent:
   - `supabase secrets set RESEND_API_KEY=<key>` (edge functions)
   - Vercel `happitime-console` → `RESEND_API_KEY`, Production (console)
   - Vercel needs a **redeploy** for the new var to reach functions.
   - Checked and *not* a third store: GitHub Actions holds no Resend secret
     (only the six `SUPABASE_*` ones).
4. Prove it: trigger one real send and confirm **delivery**, not a 200.
5. Only then flip `INTAKE_SELF_SERVE_ENABLED`.

### Separately, for the contact form

**The provider is already set up — only the app wiring is missing.** DNS for
**smtp2go** was added to `happitime.biz` 27 days ago and is intact:

```
s1035195._domainkey  CNAME  dkim.smtp2go.net.
em1035195            CNAME  return.smtp2go.net.
link                 CNAME  track.smtp2go.net.
(root SPF)           TXT    v=spf1 include:_spf.google.com include:spf.smtp2go.com ~all
```

So an smtp2go account exists and its domain authentication was completed. What
never happened is setting the credentials on the Vercel project. The directory
needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` and
optionally `SUPPORT_RECIPIENT_EMAIL` (defaults to `admin@happitime.biz`) on
`happitime-directory`. This is a **separate transport from Resend** — fixing
the Resend key does nothing for it.

Worth considering: this is the only surface still on SMTP. Moving it to Resend
would collapse the transports and leave one credential to monitor rather than
several independent ways to be silently unreachable.

### Resend's DNS is also still in place

```
resend._domainkey  TXT  p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDPByNY…
send               TXT  v=spf1 include:amazonses.com ~all
```

Added 57 days ago, in Resend's standard subdomain-sending shape. That points
toward the **key** being revoked or rotated rather than the domain having
lapsed — but only the Resend dashboard can confirm it.

## The zero-send alarm already existed — and alarmed into the void

`send-venue-digest` detects exactly this failure. When it sends zero emails
while active venues exist, it logs at error level and returns HTTP 500. It
worked, firing at 11:00:11 UTC on 2026-08-12:

```
[send-venue-digest] ALERT: 0 emails sent but 5 active venue(s) exist.
Possible misconfiguration. Date=2026-08-12 skipped=0 errors=5
```

Nobody found out because the only thing it does with that alert is **email
it**, through the same Resend account returning 401. The alarm's notification
channel was the system being alarmed about — a circular dependency, not a
missing check. Adding another detector would not have helped.

PR #161 adds the missing channel: a daily workflow reads the function's logs
from GitHub's infrastructure and fails the run, with no email in the path.

## Monitoring gap this exposes

The uptime tripwire (#158) probes PostgREST and GoTrue. It would not have
caught this, and nothing else watches it. A daily digest that silently sends
zero email looks identical to a quiet day. Worth an alert on
`send-venue-digest` error-level log lines, or a check that the digest sent
`n > 0` emails.

Separately: #158's real cadence is **~48 minutes**, not the ~10 the `*/10`
cron implies — GitHub throttles high-frequency schedules. Observed run gaps
on 2026-08-12: 46, 53, 48, 51 min.
