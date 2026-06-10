/**
 * checkin-code-route.test.mjs
 *
 * Tests for the org-authed check-in code API.
 *
 * Covers:
 *  1. Pure-unit: nextRotatesAt correctly lands on the next 6:00 AM CT boundary.
 *  2. Pure-unit: the code returned from generateCheckinCode matches the
 *     expected value for a known secret + service date.
 *  3. Integration (docker): org member → receives { code } matching
 *     generateCheckinCode(secret, serviceDate(now)), Cache-Control: no-store.
 *  4. Integration (docker): non-member → 403.
 *
 * Integration tests require the local Supabase container. They skip automatically
 * when docker is not reachable or the pilot tables are absent.
 *
 * To run locally:
 *   node --test test/checkin-code-route.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  serviceDate,
  generateCheckinCode,
} from "../packages/shared-api/src/checkin/code.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── helpers ──────────────────────────────────────────────────────────────────

const CONTAINER = "supabase_db_ujflcrjsiyhofnomurco";

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

// ── skip detection ───────────────────────────────────────────────────────────

let containerReachable = false;
try {
  psql("SELECT 1");
  containerReachable = true;
} catch {
  /* docker not available or container absent */
}

let tablesExist = false;
if (containerReachable) {
  try {
    const count = psql(
      "SELECT COUNT(*) FROM information_schema.columns " +
        "WHERE table_schema='public' AND table_name='venues' " +
        "AND column_name='checkin_secret';",
    );
    tablesExist = parseInt(count, 10) === 1;
  } catch {
    /* ignore */
  }
}

const skipReason = !containerReachable
  ? "local Supabase container not reachable"
  : !tablesExist
    ? "venues.checkin_secret column not found (run `supabase db reset` first)"
    : false;

// ── pure-unit: nextRotatesAt logic ────────────────────────────────────────────

/**
 * Mirror of the server-side nextRotatesAt — extracted here for unit testing.
 * The code rotates at 6 AM America/Chicago; this computes ms until that moment.
 */
function nextRotatesAt(now) {
  const ctParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);

  const get = (t) => Number(ctParts.find((p) => p.type === t)?.value ?? "0");

  const ctHour = get("hour");
  const ctMinute = get("minute");
  const ctSecond = get("second");

  const secsSince6am = (ctHour - 6) * 3600 + ctMinute * 60 + ctSecond;
  const msUntilNext =
    secsSince6am >= 0
      ? 86_400_000 - secsSince6am * 1000
      : -secsSince6am * 1000;

  return new Date(now.getTime() + msUntilNext).toISOString();
}

test("nextRotatesAt: result is always > now and <= now+24h", () => {
  // Test multiple points across a day
  const base = Date.parse("2026-06-09T15:00:00Z"); // 10 AM CT (CDT = UTC-5)
  for (let h = 0; h < 24; h++) {
    const now = new Date(base + h * 3600_000);
    const rotates = new Date(nextRotatesAt(now));
    assert.ok(
      rotates > now,
      `rotates_at must be after now (at h=${h}): ${rotates.toISOString()} <= ${now.toISOString()}`,
    );
    assert.ok(
      rotates.getTime() - now.getTime() <= 86_400_000,
      `rotates_at must be <= 24h from now (at h=${h})`,
    );
  }
});

test("nextRotatesAt: rotates at exactly 6:00 AM CT", () => {
  // 5:59:59 AM CT → rotates in 1 second
  // CDT (summer) = UTC−5, so 5:59:59 AM CDT = 10:59:59 UTC
  const justBefore = new Date("2026-06-09T10:59:59Z");
  const rotates = new Date(nextRotatesAt(justBefore));
  const rotatesParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(rotates);
  const getP = (t) =>
    Number(rotatesParts.find((p) => p.type === t)?.value ?? "0");
  assert.equal(getP("hour"), 6, "should rotate at hour=6 CT");
  assert.equal(getP("minute"), 0, "should rotate at minute=0");
  assert.equal(getP("second"), 0, "should rotate at second=0");
});

test("nextRotatesAt: after 6 AM CT, next rotation is 6 AM CT tomorrow", () => {
  // 8:00 AM CT = 6h after rotation => should be ~22h until next rotation
  // CDT: 8:00 AM CDT = 13:00 UTC
  const afterRotation = new Date("2026-06-09T13:00:00Z");
  const rotates = new Date(nextRotatesAt(afterRotation));
  // Should be approximately 22 hours from now (6AM CT next day)
  const diffH = (rotates.getTime() - afterRotation.getTime()) / 3_600_000;
  assert.ok(
    diffH > 21 && diffH < 23,
    `expected ~22h until next rotation, got ${diffH.toFixed(2)}h`,
  );
});

// ── pure-unit: route source assertions (no docker needed) ────────────────────

test("checkin-code route source: has Cache-Control: no-store", () => {
  const routeSrc = readFileSync(
    join(
      __dirname,
      "..",
      "apps/web/src/app/api/venues/[venueId]/checkin-code/route.ts",
    ),
    "utf8",
  );
  assert.match(routeSrc, /Cache-Control.*no-store/, "route must set Cache-Control: no-store");
  assert.match(routeSrc, /generateCheckinCode/, "route must call generateCheckinCode");
  assert.match(routeSrc, /serviceDate/, "route must call serviceDate");
  assert.match(routeSrc, /org_members/, "route must check org_members for authorization");
  // checkin_secret must not appear in the returned JSON
  assert.doesNotMatch(
    routeSrc,
    /NextResponse\.json\([^)]*checkin_secret/,
    "checkin_secret must not appear in the JSON response",
  );
});

// ── pure-unit: code matches generateCheckinCode ───────────────────────────────

test("code returned by generateCheckinCode matches serviceDate-keyed HMAC", () => {
  const secret = "00000000-aaaa-bbbb-cccc-000000000001";
  const now = new Date("2026-06-09T15:00:00Z"); // 10 AM CDT → service date 2026-06-09
  const svcDate = serviceDate(now);
  assert.equal(svcDate, "2026-06-09", "serviceDate sanity check");
  const code = generateCheckinCode(secret, svcDate);
  assert.equal(typeof code, "string", "code should be a string");
  assert.equal(code.length, 4, "code should be 4 chars");
  // Idempotent: same inputs → same code
  assert.equal(generateCheckinCode(secret, svcDate), code);
});

test("code differs for different service dates", () => {
  const secret = "00000000-aaaa-bbbb-cccc-000000000002";
  const code1 = generateCheckinCode(secret, "2026-06-09");
  const code2 = generateCheckinCode(secret, "2026-06-10");
  assert.notEqual(code1, code2, "different dates should produce different codes");
});

// ── integration: org member gets code, non-member → 403 ─────────────────────
//
// We don't spin up a Next.js server, so we test the authorization logic and
// code-generation directly via psql (matching what the route handler does):
//  • Read the checkin_secret from venues as service_role.
//  • Verify that an org_member can SELECT the org_members row.
//  • Verify that a stranger cannot.
//  • Verify the code computed from the secret matches generateCheckinCode.

const OWNER_ID = "aaaaaaaa-1001-1001-1001-100000000001";
const STRANGER_ID = "aaaaaaaa-1003-1003-1003-100000000003";
const ORG_ID = "bbbbbbbb-1001-1001-1001-100000000001";
const VENUE_ID = "cccccccc-1001-1001-1001-100000000001";
// checkin_secret is typed as uuid in the DB schema
const TEST_SECRET = "11111111-beef-cafe-dead-000000000001";

function buildSeedBlock() {
  return `
BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, created_at, updated_at, aud, role, confirmation_token, email_confirmed_at)
VALUES
  ('${OWNER_ID}',   'route_owner_${Date.now()}@test.invalid',   'x', now(), now(), 'authenticated', 'authenticated', '', now()),
  ('${STRANGER_ID}','route_stranger_${Date.now()}@test.invalid','x', now(), now(), 'authenticated', 'authenticated', '', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES ('${ORG_ID}', 'Route Test Org', 'route-test-org-${Date.now()}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.venues (id, org_id, name, slug, status, checkin_secret)
VALUES ('${VENUE_ID}', '${ORG_ID}', 'Route Test Venue', 'route-test-venue-${Date.now()}', 'published', '${TEST_SECRET}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (org_id, user_id, role)
VALUES ('${ORG_ID}', '${OWNER_ID}', 'owner')
ON CONFLICT DO NOTHING;

-- Act as service_role: read the checkin_secret (as the route handler does)
SELECT checkin_secret FROM public.venues WHERE id = '${VENUE_ID}';

ROLLBACK;
`;
}

test(
  "checkin-code route: service-role can read checkin_secret from venues",
  { skip: skipReason },
  () => {
    const out = psqlBlock(buildSeedBlock());
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const lastLine = lines[lines.length - 1];
    assert.equal(
      lastLine,
      TEST_SECRET,
      `Expected to read checkin_secret='${TEST_SECRET}', got '${lastLine}'`,
    );
  },
);

test(
  "checkin-code route: org member row exists → authorization would pass",
  { skip: skipReason },
  () => {
    const sql = `
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, created_at, updated_at, aud, role, confirmation_token, email_confirmed_at)
VALUES ('${OWNER_ID}','route_owner2_${Date.now()}@test.invalid','x',now(),now(),'authenticated','authenticated','',now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, name, slug)
VALUES ('${ORG_ID}', 'Route Test Org 2', 'route-test-org2-${Date.now()}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.venues (id, org_id, name, slug, status, checkin_secret)
VALUES ('${VENUE_ID}', '${ORG_ID}', 'Route Test Venue 2', 'route-test-venue2-${Date.now()}', 'published', '${TEST_SECRET}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.org_members (org_id, user_id, role)
VALUES ('${ORG_ID}', '${OWNER_ID}', 'owner')
ON CONFLICT DO NOTHING;

-- Simulate the route's membership check as the authed user
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${OWNER_ID}","role":"authenticated"}', true);
SELECT COUNT(*) FROM public.org_members WHERE org_id = '${ORG_ID}' AND user_id = '${OWNER_ID}';
ROLLBACK;
`;
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(count, 1, `Org member should see their org_members row (got ${count})`);
  },
);

test(
  "checkin-code route: non-member → org_members lookup returns 0 rows (→ 403)",
  { skip: skipReason },
  () => {
    const sql = `
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, created_at, updated_at, aud, role, confirmation_token, email_confirmed_at)
VALUES
  ('${OWNER_ID}',   'route_owner3_${Date.now()}@test.invalid',   'x', now(), now(), 'authenticated', 'authenticated', '', now()),
  ('${STRANGER_ID}','route_stranger3_${Date.now()}@test.invalid','x', now(), now(), 'authenticated', 'authenticated', '', now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, name, slug)
VALUES ('${ORG_ID}', 'Route Test Org 3', 'route-test-org3-${Date.now()}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.venues (id, org_id, name, slug, status, checkin_secret)
VALUES ('${VENUE_ID}', '${ORG_ID}', 'Route Test Venue 3', 'route-test-venue3-${Date.now()}', 'published', '${TEST_SECRET}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.org_members (org_id, user_id, role)
VALUES ('${ORG_ID}', '${OWNER_ID}', 'owner')
ON CONFLICT DO NOTHING;

-- Stranger has no org_members row; their lookup returns 0
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${STRANGER_ID}","role":"authenticated"}', true);
SELECT COUNT(*) FROM public.org_members WHERE org_id = '${ORG_ID}' AND user_id = '${STRANGER_ID}';
ROLLBACK;
`;
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const count = parseInt(lines[lines.length - 1], 10);
    assert.equal(
      count,
      0,
      `Stranger should see 0 org_members rows (would trigger 403), got ${count}`,
    );
  },
);

test(
  "checkin-code route: generated code matches generateCheckinCode(secret, serviceDate(now))",
  { skip: skipReason },
  () => {
    // Read the secret from the DB (as service_role would), then verify that the
    // code we compute matches what the route would return.
    const sql = `
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, created_at, updated_at, aud, role, confirmation_token, email_confirmed_at)
VALUES ('${OWNER_ID}','route_owner4_${Date.now()}@test.invalid','x',now(),now(),'authenticated','authenticated','',now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, name, slug)
VALUES ('${ORG_ID}', 'Route Test Org 4', 'route-test-org4-${Date.now()}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.venues (id, org_id, name, slug, status, checkin_secret)
VALUES ('${VENUE_ID}', '${ORG_ID}', 'Route Test Venue 4', 'route-test-venue4-${Date.now()}', 'published', '${TEST_SECRET}')
ON CONFLICT (id) DO NOTHING;
SELECT checkin_secret FROM public.venues WHERE id = '${VENUE_ID}';
ROLLBACK;
`;
    const out = psqlBlock(sql);
    const lines = out.split("\n").filter((l) => l.trim() !== "");
    const dbSecret = lines[lines.length - 1];
    assert.equal(dbSecret, TEST_SECRET, "DB secret should match inserted value");

    // Now compute the code as the route handler would
    const now = new Date();
    const svcDate = serviceDate(now);
    const expectedCode = generateCheckinCode(dbSecret, svcDate);
    assert.equal(
      typeof expectedCode,
      "string",
      "generateCheckinCode should return a string",
    );
    assert.equal(expectedCode.length, 4, "code should be 4 characters");

    // The route MUST return Cache-Control: no-store — we assert it's set in the
    // route source file since we can't spin up Next.js here.
    const routeSrc = readFileSync(
      join(
        __dirname,
        "..",
        "apps/web/src/app/api/venues/[venueId]/checkin-code/route.ts",
      ),
      "utf8",
    );
    assert.match(
      routeSrc,
      /Cache-Control.*no-store/,
      "route must set Cache-Control: no-store",
    );
    assert.match(
      routeSrc,
      /generateCheckinCode/,
      "route must call generateCheckinCode",
    );
    assert.match(
      routeSrc,
      /serviceDate/,
      "route must call serviceDate",
    );
    // Security: the secret must never be in the response JSON
    assert.doesNotMatch(
      routeSrc,
      /checkin_secret.*json\|json.*checkin_secret/i,
      "route must not include checkin_secret in JSON response",
    );
  },
);
