// test/validate-job-token-lockdown.test.mjs
//
// `public.get_validate_job_token()` is SECURITY DEFINER and was executable by
// PUBLIC/anon/authenticated. The anon key is public by design — it ships in the
// mobile bundle and the web client — so anyone could read the token and then
// call `invoke_validate_venues()` to trigger a billable Google Places job.
//
// Verified against production on 2026-08-12, before the fix:
//   get_validate_job_token (anon) -> 200 + token
//   get_digest_job_token   (anon) -> 401        <- the correctly-locked twin
//
// The cause was not a bad GRANT. It was the ABSENCE of a revoke: Postgres
// defaults function EXECUTE to PUBLIC, and 20260613220157 created these two
// with no grant statements at all. These tests pin the fix and the convention.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const LOCKDOWN = "supabase/migrations/20260813040825_revoke_validate_job_token_public.sql";

test("the lockdown migration revokes both entry points from every public role", () => {
  const sql = read(LOCKDOWN).toLowerCase();
  for (const fn of ["get_validate_job_token", "invoke_validate_venues"]) {
    for (const role of ["public", "anon", "authenticated"]) {
      assert.match(
        sql,
        new RegExp(`revoke execute on function public\\.${fn}\\(\\) from ${role};`),
        `${fn} must be revoked from ${role}`,
      );
    }
  }
});

test("service_role keeps execute, or the hourly job breaks", () => {
  // validate-venue-places reads the token via supabase.rpc() using
  // SUPABASE_SERVICE_ROLE_KEY. Revoking without this would close the exposure
  // by breaking the feature, which is not a fix.
  const sql = read(LOCKDOWN).toLowerCase();
  assert.match(sql, /grant execute on function public\.get_validate_job_token\(\) to service_role;/);
  assert.match(sql, /grant execute on function public\.invoke_validate_venues\(\) to service_role;/);
});

test("the migration records why, not just what", () => {
  // The next person needs to know this was default-open rather than a bad
  // grant, or they will look for a GRANT statement that never existed.
  const sql = read(LOCKDOWN);
  assert.match(sql, /20260613220157/, "must name the migration that introduced it");
  assert.match(sql, /defaults? to PUBLIC|EXECUTE on a function defaults/i);
});

test("no migration ever re-grants these to anon or authenticated", () => {
  // A later GRANT ... TO PUBLIC on the schema, or a copy-paste grant block,
  // would silently reopen this. Catch it at the migration level.
  const offenders = [];
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
    // The lockdown migration itself names these functions legitimately.
    if (file === "20260813040825_revoke_validate_job_token_public.sql") continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8").toLowerCase();
    for (const fn of ["get_validate_job_token", "invoke_validate_venues"]) {
      const re = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[^;]*?(anon|authenticated|public)`, "s");
      if (re.test(sql)) offenders.push(`${file} grants ${fn} to a public role`);
    }
  }
  assert.deepEqual(offenders, [], `these must never be granted to public roles:\n${offenders.join("\n")}`);
});

test("the digest twin stays locked down too", () => {
  // get_digest_job_token was already correct and is the reference this fix
  // matched. If a later migration loosens it, the same hole reopens elsewhere.
  const offenders = [];
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(migrationsDir, file), "utf8").toLowerCase();
    const re = /grant\s+execute\s+on\s+function\s+public\.get_digest_job_token[^;]*?(anon|authenticated|public)/s;
    if (re.test(sql)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], "get_digest_job_token must not be granted to public roles");
});
