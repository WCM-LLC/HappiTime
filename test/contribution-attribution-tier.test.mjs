// test/contribution-attribution-tier.test.mjs
//
// The tier written alongside created_by decides who appears on the
// leaderboard. Getting it wrong silently mis-files a contribution forever,
// because the value is a snapshot that is never recomputed.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, "..", "apps/web/src/utils/contribution-attribution.ts"),
  "utf8",
);

test("ContributorTier lists exactly the four tiers the DB constraint allows", () => {
  // Drift between this union and the migration's CHECK is a runtime 23514 at
  // write time, on a path the user cannot retry.
  const union = src.match(/export type ContributorTier =([^;]*);/);
  assert.ok(union, "ContributorTier must be exported");
  for (const tier of ["admin", "owner", "super_user", "user"]) {
    assert.ok(union[1].includes(`'${tier}'`), `${tier} missing from the union`);
  }
});

test("console writers are admin or owner, never super_user", () => {
  // Super users never write through the console actions — they go through
  // intake, which always drafts for review. A console write that claimed
  // super_user would put an unreviewed row on the board.
  assert.match(src, /export function consoleContributorTier/);
  const fn = src.slice(src.indexOf("export function consoleContributorTier"));
  assert.match(fn, /'admin'/);
  assert.match(fn, /'owner'/);
  assert.doesNotMatch(fn.slice(0, fn.indexOf("}")), /'super_user'/);
});
