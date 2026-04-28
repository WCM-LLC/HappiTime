# Supabase Migration Troubleshooting

## How Supabase migration tracking works

Supabase tracks applied migrations in a `supabase_migrations.schema_migrations` table on the remote database. Each migration file's timestamp must be applied in strictly ascending order. The CLI refuses to push if local files exist with timestamps **earlier than the last applied remote migration** — this is the "out-of-order" error.

---

## Error: "Found local migration files to be inserted before the last migration"

**Symptom**
```
Found local migration files to be inserted before the last migration on remote database.
Rerun the command with --include-all flag to apply these migrations: ...
```

**Cause**  
One or more local `.sql` files have timestamps that fall before the most recently applied remote migration. This typically happens when:
- Migrations were applied directly in the Supabase dashboard (bypassing the CLI)
- Migrations were applied from a different machine without being committed first
- Stub files were created retroactively to align history

**Diagnosis**  
Run `supabase migration list` to see a side-by-side local vs. remote comparison. Rows with a blank `Remote` column are unapplied on the remote.

**Fix**  
Two possible paths depending on whether the content is already in the database:

### Path A — Content already in prod (applied directly, no tracking)
Mark the migration as applied without re-running the SQL:
```bash
supabase migration repair --status applied <timestamp>
# Example:
supabase migration repair --status applied 20260419120000
```

### Path B — Content NOT yet in prod
Push the migration normally. If out-of-order files are blocking you:
```bash
supabase db push --include-all
```
> **Warning:** Always verify with `supabase migration list` and a schema check before using `--include-all`. Blindly re-running migrations that are already in prod can fail on non-idempotent DDL (e.g., `CREATE POLICY` without a `DROP ... IF EXISTS` guard).

---

## Error: "No such container: supabase_db_<project_ref>"

**Symptom**
```
failed to inspect container health: Error response from daemon: No such container: supabase_db_...
```

**Cause**  
`supabase status` checks your **local** Docker-based Supabase stack. This error just means the local stack isn't running — it has no bearing on the remote project.

**Fix**  
If you need local Supabase: `supabase start`  
If you're only pushing to remote (the usual case): ignore this error entirely.

---

## Stub migrations ("Applied directly to prod")

When SQL is applied directly in the Supabase dashboard, it bypasses CLI tracking. The correct remediation is:

1. Create a stub migration file with the appropriate timestamp:
   ```sql
   -- Applied directly to prod without CLI tracking.
   -- Stub for migration history alignment only.
   ```
2. Push the stub: `supabase db push` will apply the empty file and register the timestamp.
3. Future `migration list` runs will show it as synced.

> **Convention:** Stub file names should match the feature they represent so the history remains readable (e.g., `20260424023056_venue_promotions.sql`).

---

## How to detect "is this already in prod?" before pushing

Query the remote schema directly instead of guessing:

```sql
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'your_table'
  ) AS table_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'your_table'
      AND column_name = 'your_column'
  ) AS column_exists;
```

Run via the Supabase MCP tool or the SQL editor in the dashboard.

---

## April 2026 incident — out-of-order migrations

**What happened**  
Several migrations (Apr 18–23) were either skipped by the CLI or applied directly to prod, creating gaps in the tracked history. A later migration (Apr 20) was applied through the CLI, raising the remote "high watermark" above the untracked Apr 18/19 files. Subsequent `db push` calls failed with the out-of-order error.

**Root cause**  
Migrations `20260419120000` (venue_slug), `20260423120000` (venue_promotions), and `20260423130000` (events_cuisine_tags) were applied directly to prod. Stub files were created for the Apr 23 pair but not for Apr 19. No stubs existed for Apr 18.

**Schema verification (run against `ujflcrjsiyhofnomurco`)**

| Object | In prod? | Action |
|---|---|---|
| `user_preferences.notifications_happy_hours` | No | Push |
| `public.directory_events` table | No | Push |
| `venues.slug` column | **Yes** | Repair |
| `public.venue_subscriptions` table | **Yes** | Repair |
| `public.venue_events` table | **Yes** | Repair |
| `public.approved_tags` table | **Yes** | Repair |

**Resolution**
```bash
# Step 1: mark already-applied migrations as tracked
supabase migration repair --status applied 20260419120000
supabase migration repair --status applied 20260423120000
supabase migration repair --status applied 20260423130000

# Step 2: push remaining unapplied migrations
supabase db push --include-all
```

---

## Best practices going forward

1. **Never apply SQL directly in the dashboard for schema changes.** Always write a migration file first, then push via CLI.
2. **If you must apply directly**, immediately create a stub migration file and push it so the history stays aligned.
3. **Use `supabase migration list`** before every `db push` to spot gaps early.
4. **Write idempotent DDL** — use `IF NOT EXISTS`, `CREATE OR REPLACE`, and `DROP ... IF EXISTS` guards so migrations are safe to replay.
5. **One migration per logical change.** Avoid bundling unrelated schema changes — it makes repair/rollback harder.
