# HappiTime

Monorepo. `apps/{web,mobile,android,ios,directory}` + `packages/{shared-api,shared-env,shared-types,venue-qr}`.

`apps/android/App.tsx` is a one-line re-export of `apps/mobile/App` — a fix in `apps/mobile/src`
covers both platforms. There is no separate Android source tree.

Documentation index: [`docs/index.md`](docs/index.md). Start there for anything not covered here.

## Commands

```bash
npm run lint            # eslint across web, mobile, android
npm run typecheck       # builds shared packages first, then per-workspace tsc
npm test                # node --test test/*.test.mjs  (see Testing — narrower than it looks)
npm run build:web
```

CI runs exactly those four, in that order, then `build:web`. Per-workspace variants take
`--workspace <name>`, e.g. `npm run typecheck --workspace mobile`.

```bash
npm run dev:web         # Next.js
npm run dev:mobile      # builds shared packages, then expo start
```

Never run two dev servers against the same `apps/web/.next` directory — they clobber each
other's chunks and produce `ChunkLoadError`.

## Testing

`npm test` expands to `node --test test/*.test.mjs`. That glob is **non-recursive and rooted at
the repo root** — it runs the ~86 files in `test/` and nothing else.

Test files also exist under `apps/*/src/**/*.test.mjs` (web and mobile). **CI never runs them.**
If you add a test there, run it by hand: `node --test <path>`.

There is no component-test infrastructure. Tests are pure-logic `.mjs` files using `node:test`
and `node:assert/strict`; no React Native Testing Library, no jsdom. A change that can only be
verified by rendering has to be verified by rendering — say so rather than letting a green
typecheck stand in for it.

## Database

Supabase project `HappiTime-Main`. Schema changes go through **migration PRs only** — no DDL in
the dashboard SQL editor against prod. Drift is checked nightly against a clean migration replay;
see [`docs/database-change-policy.md`](docs/database-change-policy.md) for why that guardrail exists.

Migrations are append-only. To change something, add a new forward migration.

### Running SQL against prod

```bash
supabase db query --linked -f query.sql     # via Management API — no DB password needed
```

`psql` is not installed and no DB connection string is checked in; `--linked` is the path.

For data repair that must bypass triggers, use a session GUC inside one transaction — never
`ALTER TABLE … DISABLE TRIGGER`, which is DDL, applies table-wide (live users' writes would skip
the trigger too), and is recorded in `pg_dump`, so an interrupted run leaves real schema drift:

```sql
begin;
set local session_replication_role = replica;
-- targeted UPDATE, guarded on the expected old value
select ...;   -- inspect
rollback;     -- dry run first; swap for `commit` once verified
```

Verify the rollback in a *fresh* session before committing — the Management API could in principle
autocommit per statement, and a "dry run" that silently committed is worse than no dry run.

### Gotcha: any write to `happy_hour_windows` asserts verification

`touch_window_confirmed` (BEFORE) and `touch_venue_confirmed` (AFTER) fire on **every** insert or
update and:

- set `last_confirmed_at = now()` on the window, and
- set `last_confirmed_at = now()` **and `listing_disputed = false` on the parent venue**.

So a cosmetic edit — a typo fix, a wording cleanup, a backfill — claims the listing was
re-verified and silently resolves any open user-reported dispute on that venue. The window's
stamp cannot be corrected through PostgREST, because the corrective `UPDATE` re-fires the trigger.

Snapshot **both** `happy_hour_windows` and `venues` before any bulk write. Background and the
open remediation: [`docs/superpowers/specs/2026-08-19-happy-hour-label-content-model-design.md`](docs/superpowers/specs/2026-08-19-happy-hour-label-content-model-design.md).

## Workflow

Branch `master`. PR-driven, squash merge. CI green is the bar for "done".

Branch protection requires an up-to-date branch: a PR that falls behind `master` reports
`BEHIND` and refuses to merge. Run `gh pr update-branch <n>` and let CI re-run — don't reach for
`--admin`.

**GitHub Issues are disabled on this repo.** Findings and plans are tracked as dated documents in
`docs/superpowers/specs/` and `docs/superpowers/plans/`, landed through a PR like any other change.

## Content rules

- Scraped venue data is never published as venue-confirmed without review.
- Outbound email from `admin@happitime.biz` is draft-only.
- Pricing: Listed free / Verified $49 / Featured $99; org bundles $79 (2–4), $59 (5+).
  The $79/mo "Premium" tier is obsolete — do not quote it.
