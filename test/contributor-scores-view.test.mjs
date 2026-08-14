// test/contributor-scores-view.test.mjs
//
// What a contribution is worth. Pinned in SQL because every one of these is a
// product decision someone could plausibly "tidy" into something else:
// the weights, the 90-day window, the copy exclusion, and above all the fact
// that org staff are attributed but never scored.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260814130000_contributor_scores.sql"),
  "utf8",
);

test("weights are menu 10, event 3, window 1", () => {
  assert.match(sql, /\* 10/, "menus weigh 10");
  assert.match(sql, /\* 3/, "events weigh 3");
  assert.match(sql, /as score/, "the weighted total is exposed as score");
});

test("the window is 90 days measured on published_at", () => {
  assert.match(sql, /interval '90 days'/);
  assert.match(sql, /published_at > now\(\) - interval '90 days'/);
  assert.doesNotMatch(sql, /created_at > now\(\)/, "created_at is the wrong clock");
});

test("only published content counts", () => {
  const statusChecks = sql.match(/status = 'published'/g) ?? [];
  assert.equal(statusChecks.length, 3, "one per content table");
});

test("org staff are attributed but never scored", () => {
  // The rule that makes this a game rather than a staff productivity report.
  assert.match(sql, /created_by_tier in \('super_user', 'user'\)/);
  assert.doesNotMatch(sql, /'owner'|'admin'/, "org tiers must not appear in the scoring view");
});

test("copies earn nothing", () => {
  // A copied menu carries source_menu_id. Crediting copies would let one menu
  // be farmed across every venue in an org.
  assert.match(sql, /source_menu_id is null/);
});

test("the view is locked down like toastmaker_scores", () => {
  assert.match(sql, /security_invoker = on/);
  assert.match(sql, /revoke all on public\.contributor_scores from anon, authenticated/);
  assert.doesNotMatch(sql, /grant select on public\.contributor_scores to (anon|authenticated)/);
});
