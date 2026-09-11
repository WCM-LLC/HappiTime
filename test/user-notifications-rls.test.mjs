// test/user-notifications-rls.test.mjs
//
// Static guards on the user_notifications migration: owner-only RLS, the
// column-scoped read_at grant (repo trap: RLS alone is insufficient after the
// lockdown migrations — authenticated needs explicit grants), and no insert
// path for authenticated (writes are service-role only, via _shared/notify.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mig = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260731120000_user_notifications.sql"),
  "utf8"
);

test("table is recipient-scoped with the spec's columns", () => {
  assert.match(mig, /create table public\.user_notifications/);
  for (const col of ["user_id", "type", "title", "body", "data", "created_at", "read_at"]) {
    assert.match(mig, new RegExp(`\\b${col}\\b`), `missing column ${col}`);
  }
  assert.match(mig, /references auth\.users\(id\) on delete cascade/);
});

test("both indexes exist: newest-first list + unread badge partial", () => {
  assert.match(mig, /on public\.user_notifications \(user_id, created_at desc\)/);
  assert.match(mig, /on public\.user_notifications \(user_id\)\s+where read_at is null/);
});

test("RLS is enabled with owner-only select and update", () => {
  assert.match(mig, /alter table public\.user_notifications enable row level security/);
  assert.match(mig, /for select to authenticated\s+using \(user_id = auth\.uid\(\)\)/);
  assert.match(
    mig,
    /for update to authenticated\s+using \(user_id = auth\.uid\(\)\)\s+with check \(user_id = auth\.uid\(\)\)/
  );
});

test("grants are explicit and the update grant is column-scoped to read_at", () => {
  assert.match(mig, /revoke all on public\.user_notifications from anon, authenticated/);
  assert.match(mig, /grant select on public\.user_notifications to authenticated/);
  assert.match(mig, /grant update \(read_at\) on public\.user_notifications to authenticated/);
});

test("no insert policy or insert grant for authenticated", () => {
  assert.doesNotMatch(mig, /for insert/i);
  assert.doesNotMatch(mig, /grant insert/i);
});
