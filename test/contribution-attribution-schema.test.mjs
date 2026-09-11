// test/contribution-attribution-schema.test.mjs
//
// A contributor leaderboard cannot rank what nobody recorded. Before this
// migration: 0 of 136 menus and 0 of 219 windows carried an author, because
// no column existed to hold one.
//
// These tests pin the migration's shape. They read SQL rather than a live
// database, matching how the other schema tests in this suite work.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260813180000_contribution_attribution.sql"),
  "utf8",
);

test("menus and happy_hour_windows gain both attribution columns", () => {
  for (const table of ["menus", "happy_hour_windows"]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?created_by uuid`),
      `${table} needs created_by`,
    );
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?created_by_tier text`),
      `${table} needs created_by_tier`,
    );
  }
});

test("venue_events gains only the tier column", () => {
  // created_by already exists there and is already written by both the console
  // and intake. Re-adding it would be harmless with IF NOT EXISTS, but
  // claiming to add it hides that the column predates this work.
  const eventsBlock = sql.slice(sql.indexOf("alter table public.venue_events"));
  assert.match(eventsBlock, /created_by_tier text/);
});

test("every tier column allows exactly the four tiers", () => {
  // 'user' is permitted now so opening contribution to regular users later
  // needs no migration.
  const checks = sql.match(/created_by_tier in \([^)]*\)/g) ?? [];
  assert.equal(checks.length, 3, "one check constraint per table");
  for (const c of checks) {
    for (const tier of ["admin", "owner", "super_user", "user"]) {
      assert.ok(c.includes(`'${tier}'`), `${tier} must be allowed: ${c}`);
    }
  }
});

test("attribution survives account deletion as NULL, never cascading", () => {
  // Deleting an account must not delete the venue's menu. The credit
  // disappears; the content stays.
  const refs = sql.match(/references auth\.users\(id\)[^,\n]*/g) ?? [];
  assert.ok(refs.length >= 2, "expected FK references on the new columns");
  for (const r of refs) {
    assert.match(r, /on delete set null/, `must not cascade: ${r}`);
  }
});

test("no backfill and no destructive statements", () => {
  assert.doesNotMatch(sql, /\bupdate\s+public\./i, "no backfill — decided 2026-08-13");
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b/i, "nothing is dropped");
});
