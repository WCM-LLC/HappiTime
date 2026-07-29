/**
 * manager-venue-access.test.mjs
 *
 * Guards the 2026-07-29 access fixes:
 *
 * 1. Unassigned managers/hosts get org-wide venue access. The invite UI can
 *    create members with zero venue_members rows; previously 38 policies
 *    (via has_venue_assignment) plus the app gate locked them out of every
 *    venue. New rule, owner-approved: explicit assignments restrict, zero
 *    assignments = all of the org's venues (including future ones). The rule
 *    lives in THREE places that must stay in sync: the SQL helper, the
 *    server-action gate, and the page-visibility gate.
 *
 * 2. The /admin dashboard counted org_members via `select('id')`, but the
 *    table's PK is composite (org_id, user_id) — every render logged
 *    `column org_members.id does not exist`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const MIGRATION = "20260729190000_unassigned_members_org_wide_access.sql";

test("the org-wide access migration exists and redefines the helper", () => {
  const files = readdirSync(join(repoRoot, "supabase/migrations"));
  assert.ok(files.includes(MIGRATION), `missing ${MIGRATION}`);

  const sql = read(`supabase/migrations/${MIGRATION}`);
  // `create or replace` keeps the migration idempotent and keeps the original
  // signature, so the 38 dependent policies need no changes.
  assert.match(sql, /create or replace function public\.has_venue_assignment\(p_venue_id uuid\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path to 'public'/);
  // Both halves of the rule: explicit assignment OR member-with-zero-rows.
  assert.match(sql, /vm\.venue_id = p_venue_id/);
  assert.match(sql, /not exists/);
  assert.match(sql, /org_members/);
});

test("the server-action gate mirrors the zero-rows-means-org-wide rule", () => {
  const actions = read("apps/web/src/actions/venue-actions.ts");
  // The old per-venue lookup denied any member without a row for that venue.
  assert.doesNotMatch(actions, /\.eq\('venue_id', venueId\)\s*\.eq\('user_id', user\.id\)\s*\.maybeSingle\(\)/);
  // The new gate fetches all of the member's org assignments and only denies
  // when explicit rows exist that don't include this venue.
  assert.match(actions, /assignmentRows\.length > 0 && !assignmentRows\.some\(\(a\) => a\.venue_id === venueId\)/);
  assert.match(actions, /has_venue_assignment/, "keep the pointer to the SQL twin");
});

test("the venue page gate matches what a save would allow", () => {
  const page = read("apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx");
  // An unassigned manager used to see an editable form and then get
  // not_authorized on save; the visibility gate now checks assignments too.
  assert.match(page, /managesThisVenue/);
  assert.match(page, /role === 'manager' && managesThisVenue/);
  assert.match(page, /role === 'host' && managesThisVenue/);
});

test("the invite/access UI explains the zero-selection semantics", () => {
  const ui = read("apps/web/src/components/venue/AccessManager.tsx");
  assert.match(ui, /every venue in the organization|all venues in this\s+organization/);
});

test("the admin dashboard counts org_members by a real column", () => {
  const admin = read("apps/web/src/app/admin/page.tsx");
  assert.match(admin, /from\('org_members'\)\.select\('user_id', \{ count: 'exact', head: true \}\)/);
  assert.doesNotMatch(admin, /from\('org_members'\)\.select\('id'/);
});
