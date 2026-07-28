import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const migrationsDir = join(repoRoot, "supabase/migrations");
const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const lockdown = read(
  "supabase/migrations/20260727120000_lockdown_org_membership_escalation.sql"
);

// Regression guard for a privilege-escalation chain found 2026-07-27.
//
// org_members_insert_self was PERMISSIVE with check (user_id = auth.uid()).
// Permissive policies are OR-ed, and that check constrained only WHICH USER the
// row named -- never WHICH ORG it joined. Any authenticated account could
// therefore insert {org_id: <any org>, user_id: self, role: 'owner'} and inherit
// full venue create/edit/delete through venues_insert_org_members.
//
// Proven against production in a rolled-back transaction: a non-member account
// took ownership of a real customer org, renamed all 7 of its published venues,
// and created a new published venue.

test("the self-grant org_members INSERT policy is dropped", () => {
  assert.match(
    lockdown,
    /drop policy if exists "org_members_insert_self" on public\.org_members/i,
    "org_members_insert_self is the escalation vector and must be dropped"
  );
});

test("self-serve organization INSERT policies are dropped", () => {
  // Organization creation is the entry point to the venue creation flow.
  for (const policy of ["org_insert_self", "organizations_insert_authenticated"]) {
    assert.match(
      lockdown,
      new RegExp(`drop policy if exists "${policy}" on public\\.organizations`, "i"),
      `${policy} let any authenticated user open the venue creation flow`
    );
  }
});

test("the migration fails loudly if a self-grant INSERT policy survives", () => {
  // A later replay of an older capture migration could otherwise silently
  // reintroduce the hole, so the lockdown asserts its own postcondition.
  assert.match(lockdown, /raise exception/i);
  assert.match(lockdown, /polpermissive/);
  assert.match(lockdown, /user_id = auth\.uid\(\)/);
});

test("no later migration reintroduces a self-grant membership policy", () => {
  const offenders = migrations
    .filter((f) => f > "20260727120000")
    .filter((f) => {
      const sql = read(`supabase/migrations/${f}`);
      return (
        /create\s+policy[^;]*on\s+public\.org_members[^;]*with\s+check\s*\(\s*\(?\s*user_id\s*=\s*auth\.uid\(\)/is.test(
          sql
        )
      );
    });

  assert.deepEqual(
    offenders,
    [],
    `these migrations re-open the escalation: ${offenders.join(", ")}`
  );
});

test("createOrganization is gated to platform admins", () => {
  const actions = read("apps/web/src/actions/dashboard-actions.ts");
  const body = actions.slice(actions.indexOf("export async function createOrganization"));
  const fn = body.slice(0, body.indexOf("\nexport async function"));

  // The action previously ran with no role check at all.
  assert.match(fn, /await isAdmin\(\)/, "createOrganization must check isAdmin()");
  assert.match(fn, /org_create_forbidden/);
  // Non-admins must be turned away before any organization row is written.
  assert.ok(
    fn.indexOf("org_create_forbidden") < fn.indexOf('.from("organizations")'),
    "the admin gate must precede the organizations insert"
  );
});

test("the dashboard does not render the org-creation form to non-admins", () => {
  const page = read("apps/web/src/app/dashboard/page.tsx");
  assert.match(page, /canCreateOrganization = await isAdmin\(\)/);
  // The form's submit binding must sit behind the admin flag.
  const formIdx = page.indexOf("formAction={createOrganization}");
  const gateIdx = page.indexOf("{canCreateOrganization ? (");
  assert.ok(gateIdx !== -1 && gateIdx < formIdx, "create-org form must be admin-gated");
});
