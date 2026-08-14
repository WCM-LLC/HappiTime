// test/published-at-schema.test.mjs
//
// Scoring windows on WHEN CONTENT WENT LIVE, not when it was scanned. Without
// this column the only available window is created_at, which silently zeroes
// any contribution published more than 90 days after it was submitted — and a
// super user cannot publish their own work, so that delay is never theirs.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260814120000_published_at.sql"),
  "utf8",
);

test("all three content tables gain published_at", () => {
  for (const table of ["menus", "happy_hour_windows", "venue_events"]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?published_at timestamptz`),
      `${table} needs published_at`,
    );
  }
});

test("the 90-day scan is indexed on non-null values only", () => {
  // Most rows will never be published; indexing them all wastes space on a
  // column the scoring view only ever reads when set.
  const idx = sql.match(/create index[\s\S]*?where published_at is not null/g) ?? [];
  assert.equal(idx.length, 3, "one partial index per table");
});

test("no backfill and nothing destructive", () => {
  assert.doesNotMatch(sql, /\bupdate\s+public\./i, "no backfill — decided 2026-08-14");
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b/i);
});
