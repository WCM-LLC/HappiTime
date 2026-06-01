# Database Change Policy & Drift Guardrails

**Why this exists:** a 2026-06-01 audit found the migration history had stopped reproducing
prod — whole subsystems (neighborhoods, ingestion/staging, snapshots) were built directly on
prod via the dashboard, ~72 RLS policies were hand-added on prod unreviewed, and some migration
files were edited after being applied. It accumulated silently for months because nothing
measured the gap. These guardrails prevent recurrence while *raising* the security bar.

## The rule

**Every schema change to prod goes through a migration PR.** No DDL in the Supabase dashboard
SQL editor against prod. Flow: write `supabase/migrations/<ts>_*.sql` → PR → review → merge →
`supabase-db-deploy.yml` runs `supabase db push` to prod.

Migrations are **append-only**: never edit/delete/rename a migration that has already been
applied. To change something, add a new forward migration.

## The five layers

1. **Source-control of DDL (prevent at the source).** All schema changes via migration PR.
   *Lock down prod DDL access* so the rule can't be bypassed casually — see checklist below.
2. **Migration immutability (CI, blocking).** `.github/workflows/migration-guardrails.yml`
   fails any PR that modifies/deletes/renames an existing migration file.
3. **Drift detection (CI, nightly + PR).** Same workflow's `schema-parity` job runs
   `scripts/reconcile/verify-parity.sh`: builds a clean migration replay and diffs its
   `pg_dump` against prod by object set. Any divergence ⇒ the run fails (hard). This is the
   safety net — even an emergency dashboard change is caught within ~24h and must be back-filled
   into a migration. **Runs nightly + on-demand only, NOT on PRs** (a PR's new migration isn't on
   prod until merge, so PR-time parity is meaningless — the `supabase-migrations` job already
   proves migrations apply). Reconciliation reached parity 2026-06-01, so a red nightly run now
   means real out-of-band drift to investigate.
4. **Security gate (review).** Every RLS policy / grant change is now code-reviewed in the PR
   (vs. today's unreviewed dashboard edits). Run Supabase **advisors** (security + performance)
   before merging RLS changes; treat new `USING (true)` reads and `SECURITY DEFINER` without a
   pinned `search_path` as blocking findings.
5. **Low technical debt.** Once migrations == prod, periodically `supabase migration squash`
   to compress history. The Layer-3 gate keeps debt from silently re-accumulating.

## Break-glass (emergencies)

If you *must* change prod directly to stop a fire: do it, then within 24h open a migration PR
that reproduces the change idempotently (`IF [NOT] EXISTS`, `CREATE OR REPLACE`,
`DROP POLICY IF EXISTS; CREATE POLICY`). The nightly drift check will stay red until you do.

## Owner checklist (settings only you can apply)

- [ ] **Restrict prod DDL.** In the Supabase dashboard (Org → Team), set most members to a
      read-only / non-DDL role; reserve schema-changing access for a small owner set. Treat the
      SQL editor against prod as break-glass only.
- [x] **Add the `SUPABASE_DB_URL_RO` GitHub secret** — DONE (read-only `ci_readonly` role); the
      Layer-3 drift detector is live.
- [ ] **Branch protection on `master`:** require the `node`, `supabase-migrations`, and
      `migration-immutability` checks to pass; no direct pushes. (Do NOT require `schema-parity`
      — it runs nightly against master, not on PRs.)
- [x] **schema-parity is now a hard nightly gate** (reconciliation reached parity 2026-06-01;
      `continue-on-error` removed). Watch the nightly "Migration Guardrails" run — a failure
      means out-of-band prod drift to back-fill. Optionally wire it to a notification.

## For contributors

- Add a new migration; never touch old ones. Keep each migration idempotent where it could be
  re-run. Put RLS/grant changes in their own reviewable migration.
- Before merging schema changes, run locally: `bash scripts/reconcile/verify-parity.sh --linked`
  (needs a running local stack) to confirm your branch still reproduces prod.
