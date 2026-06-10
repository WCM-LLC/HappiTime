/**
 * pilot-checkin-rls.test.mjs
 *
 * Verifies the RLS SELECT policies for the pilot check-in spine tables:
 *   - checkins
 *   - round_redemptions
 *   - venue_flags
 *
 * Personas tested (each in its own isolated transaction via docker exec psql):
 *   1. Owner: user who owns the check-in can read it (count = 1)
 *   2. Org member: a different user who is an org_members row for the venue's
 *      org can read the check-in (count = 1)
 *   3. Unrelated user: a third user with no ownership or org membership cannot
 *      read the check-in (count = 0)
 *
 * Requires a running local Supabase stack (supabase_db_ujflcrjsiyhofnomurco).
 * Skips automatically when docker is not reachable or the container is absent.
 *
 * To run locally:
 *   node --test test/pilot-checkin-rls.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const CONTAINER = "supabase_db_ujflcrjsiyhofnomurco";

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a SQL string against the local Supabase DB (as postgres superuser).
 * Uses execFileSync with an argument array (no shell interpolation) to avoid
 * command-injection risk.
 *
 * For single-statement queries (no BEGIN/ROLLBACK), uses -Atc.
 * For multi-statement blocks, pipes the SQL via stdin with -qAt so that only
 * query results are output (command tags like BEGIN/INSERT/ROLLBACK are
 * suppressed by quiet mode).
 *
 * Returns trimmed stdout on success; throws on error.
 */
function psql(sql) {
  try {
    const result = execFileSync(
      "docker",
      ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return result.trim();
  } catch (err) {
    throw new Error(`psql failed: ${err.stderr?.trim() ?? err.message}`);
  }
}

/**
 * Run a multi-statement SQL block via stdin in quiet mode (-qAt).
 * Quiet mode suppresses psql command tags (BEGIN, INSERT 0 1, ROLLBACK, etc.),
 * leaving only the output of SELECT statements in stdout.
 * The SQL block must end with ROLLBACK (or COMMIT) to close the transaction.
 */
function psqlBlock(sql) {
  try {
    const result = execFileSync(
      "docker",
      ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-qAt"],
      { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"] },
    );
    return result.trim();
  } catch (err) {
    throw new Error(`psqlBlock failed: ${err.stderr?.trim() ?? err.message}`);
  }
}

// ── skip detection ───────────────────────────────────────────────────────────

let containerReachable = false;
try {
  psql("SELECT 1");
  containerReachable = true;
} catch {
  /* docker not available or container absent */
}

// Check that the pilot tables exist (migration has been applied).
let tablesExist = false;
if (containerReachable) {
  try {
    const count = psql(
      "SELECT COUNT(*) FROM information_schema.tables " +
        "WHERE table_schema='public' AND table_name IN ('checkins','round_redemptions','venue_flags');",
    );
    tablesExist = parseInt(count, 10) === 3;
  } catch {
    /* ignore */
  }
}

const skipReason = !containerReachable
  ? "local Supabase container not reachable"
  : !tablesExist
    ? "pilot check-in tables not found (run `supabase db reset` first)"
    : false;

// ── seed SQL helpers ──────────────────────────────────────────────────────────
//
// Each test runs inside a single BEGIN…ROLLBACK transaction so seed data is
// automatically discarded. The seed must:
//   1. Insert into auth.users (FK target for checkins.user_id / org_members.user_id).
//   2. Insert into public.organizations + public.venues (with an org_id FK).
//   3. Insert into public.org_members for the "org member" persona.
//   4. Insert into public.checkins (and round_redemptions / venue_flags as needed).
//
// JWT persona: SET LOCAL role authenticated + set_config('request.jwt.claims', ...).
// After seeding (as postgres), we switch role to authenticated, set the JWT
// claims, query, and record the count — then RESET ROLE before the ROLLBACK.

// Fixed UUIDs for each persona (deterministic, collision-safe for ephemeral test data).
const OWNER_ID   = "aaaaaaaa-0001-0001-0001-000000000001";
const MEMBER_ID  = "aaaaaaaa-0002-0002-0002-000000000002";
const STRANGER_ID = "aaaaaaaa-0003-0003-0003-000000000003";
const ORG_ID     = "bbbbbbbb-0001-0001-0001-000000000001";
const VENUE_ID   = "cccccccc-0001-0001-0001-000000000001";
const CHECKIN_ID = "dddddddd-0001-0001-0001-000000000001";
const REDEMP_ID  = "eeeeeeee-0001-0001-0001-000000000001";
const FLAG_ID    = "ffffffff-0001-0001-0001-000000000001";

/**
 * Build the seed + persona-query block for a given table and user UUID.
 * Returns the integer count visible to that persona.
 */
function buildBlock({ userUuid, table, rowId }) {
  // column by which to filter for the specific test row
  const whereClause =
    table === "venue_flags"
      ? `id = '${rowId}'`
      : `id = '${rowId}'`;

  return `
BEGIN;

-- seed: auth users
INSERT INTO auth.users (id, email, encrypted_password, created_at, updated_at, aud, role, confirmation_token, email_confirmed_at)
VALUES
  ('${OWNER_ID}',   'rls_owner_${Date.now()}@test.invalid',   'x', now(), now(), 'authenticated', 'authenticated', '', now()),
  ('${MEMBER_ID}',  'rls_member_${Date.now()}@test.invalid',  'x', now(), now(), 'authenticated', 'authenticated', '', now()),
  ('${STRANGER_ID}','rls_stranger_${Date.now()}@test.invalid','x', now(), now(), 'authenticated', 'authenticated', '', now())
ON CONFLICT (id) DO NOTHING;

-- seed: org + venue
INSERT INTO public.organizations (id, name, slug)
VALUES ('${ORG_ID}', 'RLS Test Org', 'rls-test-org-${Date.now()}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.venues (id, org_id, name, slug, status)
VALUES ('${VENUE_ID}', '${ORG_ID}', 'RLS Test Venue', 'rls-test-venue-${Date.now()}', 'published')
ON CONFLICT (id) DO NOTHING;

-- seed: org member (the "member" persona, NOT the owner)
INSERT INTO public.org_members (org_id, user_id, role)
VALUES ('${ORG_ID}', '${MEMBER_ID}', 'host')
ON CONFLICT DO NOTHING;

-- seed: the specific row under test
${
  table === "checkins"
    ? `INSERT INTO public.checkins (id, user_id, venue_id, method, service_date)
VALUES ('${rowId}', '${OWNER_ID}', '${VENUE_ID}', 'code', current_date)
ON CONFLICT (id) DO NOTHING;`
    : table === "round_redemptions"
      ? `INSERT INTO public.round_redemptions (id, user_id, venue_id)
VALUES ('${rowId}', '${OWNER_ID}', '${VENUE_ID}')
ON CONFLICT (id) DO NOTHING;`
      : /* venue_flags */
        `INSERT INTO public.venue_flags (id, venue_id, flag_type)
VALUES ('${rowId}', '${VENUE_ID}', 'staff_code_unknown')
ON CONFLICT (id) DO NOTHING;`
}

-- act as the persona
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${userUuid}","role":"authenticated"}', true);

-- query: how many rows can this persona see?
SELECT COUNT(*) FROM public.${table} WHERE ${whereClause};

ROLLBACK;
`;
}

// ── tests ─────────────────────────────────────────────────────────────────────

// checkins ---------------------------------------------------------------

test(
  "checkins: owner reads own row (count = 1)",
  { skip: skipReason },
  () => {
    const sql = buildBlock({ userUuid: OWNER_ID, table: "checkins", rowId: CHECKIN_ID });
    const out = psqlBlock(sql);
    // psql -Atc returns the last SELECT's single value
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 1, `Owner should see 1 checkin row, got ${count}`);
  },
);

test(
  "checkins: org member of venue's org reads the row (count = 1)",
  { skip: skipReason },
  () => {
    const sql = buildBlock({ userUuid: MEMBER_ID, table: "checkins", rowId: CHECKIN_ID });
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 1, `Org member should see 1 checkin row, got ${count}`);
  },
);

test(
  "checkins: unrelated authenticated user is blocked (count = 0)",
  { skip: skipReason },
  () => {
    const sql = buildBlock({ userUuid: STRANGER_ID, table: "checkins", rowId: CHECKIN_ID });
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 0, `Stranger should see 0 checkin rows, got ${count}`);
  },
);

// round_redemptions -------------------------------------------------------

test(
  "round_redemptions: owner reads own row (count = 1)",
  { skip: skipReason },
  () => {
    const sql = buildBlock({ userUuid: OWNER_ID, table: "round_redemptions", rowId: REDEMP_ID });
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 1, `Owner should see 1 redemption row, got ${count}`);
  },
);

test(
  "round_redemptions: org member reads the row (count = 1)",
  { skip: skipReason },
  () => {
    const sql = buildBlock({ userUuid: MEMBER_ID, table: "round_redemptions", rowId: REDEMP_ID });
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 1, `Org member should see 1 redemption row, got ${count}`);
  },
);

test(
  "round_redemptions: unrelated user is blocked (count = 0)",
  { skip: skipReason },
  () => {
    const sql = buildBlock({ userUuid: STRANGER_ID, table: "round_redemptions", rowId: REDEMP_ID });
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 0, `Stranger should see 0 redemption rows, got ${count}`);
  },
);

// venue_flags -------------------------------------------------------------

test(
  "venue_flags: org member reads flag for their venue (count = 1)",
  { skip: skipReason },
  () => {
    const sql = buildBlock({ userUuid: MEMBER_ID, table: "venue_flags", rowId: FLAG_ID });
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 1, `Org member should see 1 venue_flag row, got ${count}`);
  },
);

test(
  "venue_flags: unrelated user is blocked (count = 0)",
  { skip: skipReason },
  () => {
    const sql = buildBlock({ userUuid: STRANGER_ID, table: "venue_flags", rowId: FLAG_ID });
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 0, `Stranger should see 0 venue_flag rows, got ${count}`);
  },
);
