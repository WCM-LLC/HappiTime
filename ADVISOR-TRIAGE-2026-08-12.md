# Supabase advisor triage — 2026-08-12

369 findings: **66 security**, **303 performance**. Nothing here is a regression
from today's work; all of it predates this session.

**Count is not severity.** One finding is worth acting on tonight, a handful are
worth scheduling, and roughly 250 are either informational or actively wrong to
"fix". Ranked below by real exposure, not by advisor level.

---

## P1 — Act on this one

### An anonymous caller can retrieve a job token and trigger a backend job

`public.get_validate_job_token()` is `SECURITY DEFINER` and executable by
`PUBLIC`, `anon`, and `authenticated`. The anon key is public by design — it
ships in the mobile bundle and the web client — so this is effectively
unauthenticated.

Verified live, token value masked:

```
POST /rest/v1/rpc/get_validate_job_token   (anon key)  → HTTP 200, 66-char token
POST /rest/v1/rpc/get_digest_job_token     (anon key)  → HTTP 401
```

The contrast is the tell. The digest equivalent is granted only to `postgres`
and `service_role`. The validate one was left wide open — an oversight, not a
decision.

`public.invoke_validate_venues()` is also `anon`-executable, and it calls
`get_validate_job_token()` and then invokes the `validate-venue-places` edge
function. So the chain available to anyone holding the public key is:

1. read the job token, then
2. trigger the venue-validation job at will

That job calls the Google Places API (billable) and writes venue data. This is
a cost and data-integrity exposure, not a data-disclosure one — no user records
leak — but it is remotely triggerable by anybody.

*(I read the token to confirm the exposure. I did not call
`invoke_validate_venues`, because that would have run the job.)*

**Fix:** mirror what `get_digest_job_token` already does.

```sql
revoke execute on function public.get_validate_job_token()  from public, anon, authenticated;
revoke execute on function public.invoke_validate_venues()  from public, anon, authenticated;
```

**Rotate the token in `private.validate_job_tokens` regardless of when the
revoke happens.** Two independent reasons: the value has been retrievable by
anyone holding the public anon key for as long as this has been live, and it
was retrieved during this investigation to prove the exposure — so it now also
exists in an agent session transcript. Revoking access does not un-disclose a
value that has already been read. Rotation is the part that actually closes it.

---

## P2 — Worth scheduling

### 1. `SECURITY DEFINER` view survived the #146 lockdown pass

**1 ERROR** — `public.public_guide_authors` is defined `SECURITY DEFINER`, so it
runs with the definer's rights and bypasses the caller's RLS. #146 was
specifically the pass that locked these down, so this one either post-dates it
or was missed. Worth a look precisely because it was supposed to be handled.

### 2. Auth server is capped at 10 database connections

**1 INFO**, and I would not have flagged it except for the timing:

> Your project's Auth server is configured to use at most 10 connections.
> Switch to a percentage-based connection setting.

On 2026-08-12 GoTrue hung for roughly half an hour while every status signal
read healthy — the incident that produced the uptime tripwire (#158) and the
health endpoint (#160). A hard 10-connection ceiling on the auth server is one
of the few configurations that produces exactly that shape: logins stop, the
project still reports `ACTIVE_HEALTHY`, and nothing else is affected.

This is **not proof** of the cause, and I have not established one. But it is
the single most plausible mechanism I have seen for that failure, and it is a
settings change rather than a code change. Worth investigating before the next
scale-up, because raising the instance size will not help while this is
absolute rather than percentage-based.

### 3. Duplicate indexes — 3 WARN, safe and cheap

```
public.menu_sections   {idx_menu_sections_menu, menu_sections_menu_id_idx}
public.organizations   {organizations_slug_key, organizations_slug_unique}
public.venues          {idx_venues_org, venues_org_id_idx, venues_org_idx}
```

Identical indexes cost write throughput and storage for nothing. Dropping the
extras is low-risk — but keep the one backing a UNIQUE constraint on
`organizations.slug`; the constraint index is not the one to drop.

---

## P3 — Context-dependent, needs judgement

### 168 × `multiple_permissive_policies` (WARN)

Concentrated in 23 tables; worst offenders `guides` (28), `venue_events` (28),
`venue_tags` (22), `guide_submissions` (14).

**The number is inflated.** This lint counts once per
(table × role × action) combination, so four policies on one table across two
roles and four actions reports as many findings from a handful of policies.
Twenty-eight findings on `guides` is not twenty-eight problems.

That said, multiple permissive policies mean Postgres evaluates every one and
ORs the results, on every row. #147 and #148 already did a pass here (scalar
subselects, 31 redundant policies dropped), so this is the long tail rather
than untouched ground. Worth a pass on `guides` and `venue_events` specifically
if either is slow; not worth a sweeping change otherwise.

### 40 × `unindexed_foreign_keys` (INFO)

Top: `staging_happy_hour_windows` (3), `crm_activities` (2), `events` (2),
`org_invites` (2), `staging_venues` (2), `venue_members` (2).

An unindexed FK hurts when you delete or update the parent, or join on it.
Several of these are staging and CRM tables where that may never happen at
volume. Index the ones on paths that actually run — `venue_members` and
`events` are the plausible candidates — and leave the staging tables alone.

---

## P4 — Leave these alone

### 9 × `rls_enabled_no_policy` (INFO) — this is usually correct

`admin_users`, `api_rate_limits`, `app_releases`, `happy_hour_windows_snapshot`,
`intake_extract_log`, `notion_venue_import`, `reference_snapshots`,
`reserved_handles`, `venues_snapshot`.

RLS enabled with **no** policy means **deny by default**: no `anon` or
`authenticated` access at all, with `service_role` bypassing RLS as it always
does. For service-role-only tables — snapshots, rate limits, admin lists,
import staging — that is the correct and safest configuration.

The advisor flags it because the pattern *can* mean "someone enabled RLS and
forgot the policy". Here it reads as deliberate. **Adding policies to silence
these would loosen security, not tighten it.**

### 88 × `unused_index` (INFO)

"Unused" means *not used since the last stats reset*, on a product with modest
traffic and a database that has been reset and migrated repeatedly. Several of
these almost certainly back queries that run rarely (admin screens, cron jobs,
seasonal paths) or that have not run since the counters were zeroed.

Dropping indexes on that evidence is how you discover which ones mattered.
Revisit after a stable stretch with real traffic and unreset stats.

### 2 × `no_primary_key`, 1 × `table_bloat`

- `private.validate_job_tokens` and `public.notion_venue_import` lack PKs. Both
  are single-purpose internal tables; a PK adds little here.
- `net._http_response` is bloated — that is the **pg_net extension's own**
  response table, not application data. It is managed by the extension and
  grows with queued HTTP calls (the cron jobs fire a lot of these). Clearing it
  is extension maintenance, not a schema problem; there is already a
  `prune_cron_logs` function in this database suggesting prior housekeeping.

---

## Method

- Security lints: full set of 66 read and classified.
- Performance lints: full set of 303 read and classified.
- The P1 finding was **verified against production** with the public anon key,
  and contrasted with the correctly-locked `get_digest_job_token` as a control.
- `invoke_validate_venues` was **not** executed.
- Nothing in this document has been changed. It is a triage list, not a
  changelog.

## Suggested order

1. Revoke the two `validate` grants and rotate that token. *(P1, tonight)*
2. Look at `public_guide_authors` — a `SECURITY DEFINER` view that a dedicated
   pass was supposed to have caught. *(P2)*
3. Investigate the Auth 10-connection cap against the 2026-08-12 timeline. *(P2)*
4. Drop the duplicate indexes. *(P2, cheap)*
5. Everything else only when something is measurably slow.
