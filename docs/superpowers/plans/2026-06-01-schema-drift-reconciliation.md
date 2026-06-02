# Schema-Drift Reconciliation Plan (prod = intended target)

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans, task-by-task. Checkbox (`- [ ]`) steps. **Hard rule: every migration must be a verified NO-OP against current prod** (the integration auto-applies on merge) **and must move a fresh replay toward prod.** Validate against the authoritative inventory + `pg_dump` parity, never against raw `db diff`.

**Goal:** Make a fresh migration replay (`supabase db reset`) reproduce prod's *current* schema exactly, so local dev / CI preview branches / restores get a working schema, while leaving prod untouched.

**Decision (settled):** prod is the intended target. Reconcile **forward**.

**Architecture:** A sequence of small, idempotent forward migrations — one per out-of-band *subsystem* plus a drop migration for the abandoned BCNF objects — each mechanically built from prod's `pg_dump`, guarded for idempotency, and verified by re-dumping the shadow and diffing against prod. **Not a re-baseline** (rationale in Methodology).

**Tech stack:** Supabase CLI, Postgres 17, local stack as the shadow, `pg_dump` as the oracle, MCP `execute_sql` against prod (`ujflcrjsiyhofnomurco`).

---

## Methodology: forward-fix, not re-baseline

| | Forward-fix (chosen) | Re-baseline (`db dump` + `migration repair`) |
|---|---|---|
| Prod ledger | append-only (safe) | rewrite 83 applied versions (high blast radius under auto-deploy-on-merge) |
| Prod schema | untouched (every stmt no-op) | untouched, but ledger surgery can wedge the integration mid-flight |
| Reviewability | per-subsystem PRs | one giant baseline |
| Verifiable | yes (`pg_dump` parity per stage) | yes, but all-or-nothing |
| History honesty | mirrors reality (built→dropped, added-later) | flattens it |

Re-baseline is kept in **Appendix A** as a documented alternative for a future maintenance window; it is **not** chosen because the Supabase GitHub integration auto-applies migrations to prod on merge, making live-ledger surgery dangerous.

## Authoritative inventory (the source of truth for this plan)

From `memory/schema_drift_audit_2026-06-01.md` (method: clean `db reset` replay → dual `pg_dump` → set + full-body diff). Artifacts: `/private/tmp/{shadow,prod}.public.sql`, `{shadow,prod}.custom.sql`, `{shadow,prod}.{ids,cols,fns,polys}`.

**Drop (migrations create, prod lacks — abandoned BCNF):** tables `happy_hour_menu_item_prices`, `happy_hour_offer_windows`, `happy_hour_places`, `happy_hour_window_days`, `menu_item_base_prices`, `organization_merge_audit`, `visit_rating_aspects`; 12 BCNF functions; their triggers/indexes/27 policies (via cascade); columns `venue_visits.updated_at/visited_at`, `venues.post_visit_rating_enabled/post_visit_rating_aspects`.

**Add (prod has, migrations lack — out-of-band):** tables `neighborhoods`, `email_signups`, `staging_venues`, `staging_happy_hour_windows`, `venues_snapshot`, `happy_hour_windows_snapshot`, `reference_snapshots`; type `neighborhood_tier`; functions `capture_reference_snapshot`, `merge_staging_venues`, `restore_venue_from_snapshot`, `protect_verified_venues`, `prune_cron_logs`; 25 indexes; 6 columns (`happy_hour_windows.is_verified/verified_at/verified_by`, `venue_media.migrated_at/storage_bucket_legacy/storage_path_legacy`); ~72 RLS policies on live tables. Custom schemas: prod-only `archive.happy_hour_places`, `archive.organization_members`, `private.geocode_job_tokens`, `private.places_job_tokens`; the two visit-trigger fns are in `app_private` on prod vs `private` in migrations (relocate).

**Confirm-before-drop (shadow-only, but may be a feature prod is *accidentally* missing):** `app_private.deleted_user_data_archives(+_items)` + `app_private.archive_auth_user_before_delete`. See Stage 8.

**Non-schema:** cron 3 jobs + `prune_cron_logs` ([[out_of_band_prod_inventory]]); edge fn `cleanup-orphaned-media` (decide vendor/delete separately).

---

## Invariants (every stage obeys these)

1. **No-op on prod.** Idempotency transforms by object type:
   - table → `CREATE TABLE IF NOT EXISTS` (pg_dump already emits this)
   - column → `ADD COLUMN IF NOT EXISTS`
   - index → `CREATE INDEX IF NOT EXISTS` (add the `IF NOT EXISTS`)
   - function/trigger → `CREATE OR REPLACE …` (pg_dump emits for PG14+)
   - **policy** → `DROP POLICY IF EXISTS x ON t; CREATE POLICY x ON t …` (PG17 has **no** `CREATE POLICY IF NOT EXISTS` — verified)
   - type/enum → `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='…') THEN CREATE TYPE …; END IF; END $$;`
   - constraint → `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='…') THEN ALTER TABLE … ADD CONSTRAINT …; END IF; END $$;`
   - drops → `DROP … IF EXISTS … [CASCADE]`
   - grants → already idempotent
2. **Verification is `pg_dump` parity, not `db diff`.** Per stage: `supabase db reset --local` → `supabase db dump --local` → diff vs the frozen prod dump → the stage's objects must stop diverging and **no new divergence** appears.
3. **Append-only.** Never edit historical migration files (the ledger recorded them as-run).
4. **CI gate.** Each PR must be green including **Supabase Preview** (it applies the new migration to a fresh branch — the integration's own parity check).
5. **Security review.** The ~72 live-table policies were added via dashboard without code review; review each before canonizing (esp. broad `USING (true)` ones like `Public read venues`).

---

## Stage 0 — Tooling & frozen oracle

**Files:** `scripts/reconcile/guard-ddl.sh` (extract a subsystem's DDL from a dump + apply the idempotency transforms above), `scripts/reconcile/verify-parity.sh` (`db reset` → dump local → diff vs frozen prod dump, print per-class divergence).

- [ ] **Step 1:** Freeze the oracle. `supabase db dump --linked --schema public,cron,archive,app_private,private -f /private/tmp/prod.frozen.sql`. Re-snapshot only via an explicit, dated step (prod may change under you).
- [ ] **Step 2:** Write `guard-ddl.sh` (sed/awk: add `IF NOT EXISTS` to `CREATE INDEX`; wrap `CREATE TYPE` in the `DO`-guard; prefix each `CREATE POLICY` with `DROP POLICY IF EXISTS`; leave `CREATE TABLE IF NOT EXISTS`/`CREATE OR REPLACE` as-is).
- [ ] **Step 3:** Write `verify-parity.sh`: `supabase db reset --local >/dev/null` → `supabase db dump --local --schema … -f /tmp/shadow.now.sql` → object-set + full-policy diff vs `prod.frozen.sql`; exit non-zero if divergence ≠ expected.
- [ ] **Step 4:** Baseline run of `verify-parity.sh` to capture the starting divergence set (the full inventory above). Commit tooling.

## Stage 1 — Drop the abandoned BCNF objects (high-confidence)

**File:** `supabase/migrations/<TS>_reconcile_drop_dead_bcnf.sql`

- [ ] **Step 1:** Re-validate each target is absent on prod (catalog query — never trust the dump alone): the 7 tables via `to_regclass`, the 12 functions via `pg_proc`, the 4 columns via `information_schema.columns`. Drop only validated-absent objects.
- [ ] **Step 2:** Write the migration: `DROP TABLE IF EXISTS public.<t> CASCADE;` ×7 (cascade clears their policies/indexes/triggers/FKs), `DROP FUNCTION IF EXISTS public.<f>(<sig>);` for any standalone BCNF fn not cascaded (use exact signatures from the creating migrations), `ALTER TABLE … DROP COLUMN IF EXISTS …;` ×4.
- [ ] **Step 3:** `verify-parity.sh` → the 7 tables/12 funcs/4 cols/27 policies/triggers/indexes disappear from the shadow-only set; nothing new appears.
- [ ] **Step 4:** Commit → PR → CI green (incl. Supabase Preview) → merge. Confirm post-merge the prod ledger gains the version and `to_regclass` for the 7 tables stays `null` (no-op).

## Stage 2 — `neighborhoods` subsystem (unblocks `apps/directory` on fresh envs)

**File:** `supabase/migrations/<TS>_capture_neighborhoods.sql`

- [ ] **Step 1:** `guard-ddl.sh neighborhoods` extracts from `prod.frozen.sql`: `neighborhood_tier` type (DO-guarded), `CREATE TABLE IF NOT EXISTS public.neighborhoods`, its constraints (constraint-guarded), indexes (`idx_neighborhoods_tier` → `IF NOT EXISTS`), and policies `Anyone can read neighborhoods` / `Service role manages neighborhoods` (drop-then-create), plus grants.
- [ ] **Step 2:** Review the extracted DDL for correctness + the 2 policies for over-permissiveness.
- [ ] **Step 3:** `verify-parity.sh` → neighborhoods + type leave the prod-only set; no new divergence.
- [ ] **Step 4:** Commit → PR → CI green → merge.

## Stage 3 — Ingestion/staging subsystem (unblocks web admin staging UI)

**File:** `<TS>_capture_ingestion_staging.sql` — `staging_venues`, `staging_happy_hour_windows` tables; functions `merge_staging_venues`, `protect_verified_venues`; their indexes (`staging_venues_run_idx`, `staging_venues_status_idx`) + RLS. Same extract→guard→verify→PR loop. (Ties to the already-vendored `ingest-venues` function.)

## Stage 4 — Snapshots/archive subsystem

**File:** `<TS>_capture_snapshots_archive.sql` — tables `venues_snapshot`, `happy_hour_windows_snapshot`, `reference_snapshots`; functions `capture_reference_snapshot`, `restore_venue_from_snapshot`; custom-schema `archive.happy_hour_places`, `archive.organization_members`, and grants. Extract→guard→verify→PR.

## Stage 5 — `email_signups`

**File:** `<TS>_capture_email_signups.sql` — table + `Allow anonymous inserts` policy (review the anon-insert policy) + `idx_email_signups_email`.

## Stage 6 — Out-of-band live-table RLS + indexes + columns

**File:** `<TS>_capture_live_table_drift.sql`

- [ ] **Step 1:** Extract the ~72 prod-only policies on shared/live tables (`happy_hour_windows`, `menu_sections`, `menu_items`, `venue_events`, `venues`, `venue_tags`, `organizations`, `menus`, `venue_visits`, `org_members`, `event_media`, `venue_members`, `approved_tags`, `venue_media`, `org_invites`, `happy_hour_window_menus`, `happy_hour_offers`) as drop-then-create; the 25 prod-only indexes as `CREATE INDEX IF NOT EXISTS`; the 6 columns as `ADD COLUMN IF NOT EXISTS`.
- [ ] **Step 2: SECURITY REVIEW (required).** These policies entered prod via dashboard without review. Audit each — flag over-permissive `USING (true)` reads and any policy widening write access — and get explicit sign-off before canonizing. This is the security-sensitive stage.
- [ ] **Step 3:** verify-parity → live-table policy/index/column divergence → 0.
- [ ] **Step 4:** PR → CI green → merge. (Consider splitting per-table if review is large.)

## Stage 7 — cron + private tokens + schema relocation

**File:** `<TS>_capture_cron_and_private.sql` — `CREATE OR REPLACE FUNCTION public.prune_cron_logs()`; idempotent cron registration (`cron.unschedule` if exists then `cron.schedule`) for the 3 jobs; `private.geocode_job_tokens`/`places_job_tokens` if not already produced; relocate the two visit-trigger fns to match prod (`app_private`). Verify cron via `cron.job` (data — invisible to `db diff`, check directly).

## Stage 8 — Confirm-before-drop (judgment call) ⚠️

The user-deletion archival subsystem (`app_private.deleted_user_data_archives(+_items)`, `archive_auth_user_before_delete`) and `private.prevent_duplicate_venue_visit`/`sync_venue_visit_user_event` are **in migrations but absent on prod**. "prod is target" implies dropping them — **but** a user-deletion-archival feature absent from prod may be an *accidental* prod omission, not an intended removal.

- [ ] **Step 1:** Surface these to the user with their creating-migration context. Decide per-object: drop (match prod) vs. backfill onto prod (treat as a prod gap).
- [ ] **Step 2:** Execute the decision (drop migration, or a separate "apply to prod" migration). Do not silently drop.

## Stage 9 — App cleanup

- [ ] Remove/guard `apps/mobile/src/hooks/useVisitRating.ts:88` (`(supabase as any).from("visit_rating_aspects").upsert(...)` — table intentionally gone). Grep for any other refs to dropped objects.

## Stage 10 — FINAL PARITY GATE (definition of done)

- [ ] **Step 1:** `supabase db reset --local` (fresh full replay) → `supabase db dump --local --schema public,cron,archive,app_private,private` → diff vs a **re-frozen** prod dump.
- [ ] **Step 2:** **Pass = empty diff** across all five schemas (modulo documented platform-managed roles). This proves migrations reproduce prod.
- [ ] **Step 3:** Spin up a throwaway Supabase preview branch (or rely on the per-PR Supabase Preview) and confirm `apps/directory` (neighborhoods) + web admin (staging) build/run against the replayed schema — the real-world proof that fresh envs now work.
- [ ] **Step 4:** Update `zero-migration-drift.md` / `schema_drift_audit_2026-06-01.md`: schema drift reconciled; record the final parity check as the new invariant (`verify-parity.sh` in CI to prevent regression).

---

## Risks

- **Canonizing unreviewed RLS (Stage 6)** — capturing prod's dashboard-added policies verbatim bakes in whatever they currently do. Mitigated by the required security review.
- **Prod moves under you** — re-freeze the oracle before the final gate; if prod changed, re-diff.
- **Cron is data, not schema** — `db diff`/`pg_dump` won't catch `cron.job`; verify via `cron.job` directly (Stage 7).
- **Stage 8 data-loss risk** — never drop the archival subsystem without explicit confirmation.
- **Scope** — this is ~8–10 PRs. Stages 1–5 are mostly mechanical/high-confidence; Stage 6 is the heavy review; Stage 8 needs a decision.

## Appendix A — Re-baseline alternative (not chosen)

`supabase db dump --linked` → single baseline migration; archive the 83 files; `supabase migration repair --status reverted <83…>` + `--status applied <baseline>` to rewrite the remote ledger. Cleaner final history, but live-ledger surgery under auto-deploy-on-merge is high blast radius. Revisit only in a deliberate maintenance window with the integration paused and explicit go-ahead.
