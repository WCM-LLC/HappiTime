// test/intake-permission-model.test.mjs
//
// Three defects found on 2026-08-13 while investigating "an owner downloaded
// the app and couldn't see the Happy Hour scan feature".
//
// B. INTAKE_SCAN_ROLES listed ['owner','admin','editor']. This product's org
//    roles are owner / manager / host — 'admin' and 'editor' do not exist in
//    the invite UI or in the database. Every sibling role set in the codebase
//    (VENUE_MANAGER_ROLES, VENUE_CONTENT_ROLES, ORG_MENU_ROLES) includes
//    manager; only the intake one didn't. Its own comment says it should
//    "mirror menus_write_org_editors, so anyone already trusted to edit
//    menus", so the omission was a bug, not a policy.
//
// C. Approving a queued submission published it outright. The owner now gets
//    an unpublished draft and publishes deliberately, which is what
//    HT-SOP-003 wants for scanned content.
//
// D. The mobile entry point hid the scan button identically whether the user
//    lacked permission or the check simply failed — the same
//    failure-presented-as-absence pattern as the intake extract bug.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const access = read("apps/web/src/utils/intake-access.ts");
const review = read("apps/web/src/utils/intake-review.ts");
const reviewUi = read("apps/web/src/components/intake/IntakeReviewActions.tsx");
const profile = read("apps/mobile/src/screens/ProfileScreen.tsx");

/** The string members of an exported array or Set literal. */
function roleList(src, name) {
  const i = src.indexOf(name);
  assert.notEqual(i, -1, `${name} not found`);
  const open = src.indexOf("[", i);
  const close = src.indexOf("]", open);
  assert.ok(open !== -1 && close !== -1, `${name} is not an array literal`);
  return src
    .slice(open + 1, close)
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

// ── B ────────────────────────────────────────────────────────────────────

test("scan roles cover the roles this product actually issues", () => {
  // owner / manager / host are what the invite UI offers and what the
  // org_members table holds. A manager who cannot scan is the bug.
  const scan = roleList(access, "INTAKE_SCAN_ROLES");
  for (const role of ["owner", "manager", "host"]) {
    assert.ok(scan.includes(role), `${role} must be able to scan; got ${scan.join(", ")}`);
  }
});

test("scan roles mirror the venue content roles, as the comment promises", () => {
  // intake-access.ts says SCAN "mirrors menus_write_org_editors, so anyone
  // already trusted to edit menus". Pin that to the real constant so the two
  // cannot drift apart again.
  const scan = roleList(access, "INTAKE_SCAN_ROLES");
  const content = roleList(read("apps/web/src/actions/venue-actions.ts"), "VENUE_CONTENT_ROLES");
  assert.deepEqual(
    [...scan].sort(),
    [...content].sort(),
    "INTAKE_SCAN_ROLES must equal VENUE_CONTENT_ROLES",
  );
});

test("manager and host can scan but cannot approve", () => {
  // Publishing rights are checked separately against INTAKE_APPROVE_ROLES, so
  // widening scan access must not widen publish access. If it did, a host
  // could put content live on a public listing unreviewed.
  const approve = roleList(access, "INTAKE_APPROVE_ROLES");
  assert.ok(!approve.includes("manager"), "manager must queue for review");
  assert.ok(!approve.includes("host"), "host must queue for review");
  assert.ok(approve.includes("owner"), "owner approves");
});

// ── C ────────────────────────────────────────────────────────────────────

test("approving a submission produces a draft, never a publish", () => {
  const fn = review.slice(
    review.indexOf("export async function approveSubmission"),
    review.indexOf("export async function rejectSubmission"),
  );
  assert.ok(fn.length > 0, "approveSubmission not found");
  assert.doesNotMatch(
    fn,
    /status:\s*'published'/,
    "approval must not publish — the owner publishes as a separate, deliberate step",
  );
  // It must still record the decision, or the queue never drains.
  assert.match(fn, /'approved'/, "the submission must still be marked approved");
});

test("the reviewer UI does not promise publishing", () => {
  assert.doesNotMatch(
    reviewUi,
    /Approve & publish|Publishing…/,
    "approving no longer publishes; the copy must not say it does",
  );
  assert.match(reviewUi, /Approve/, "there is still an approve control");
});

// ── D ────────────────────────────────────────────────────────────────────

test("the mobile scan gate distinguishes 'not allowed' from 'could not check'", () => {
  // Before: .catch(() => setCanScanMenus(false)) — a network failure and a
  // genuine denial were indistinguishable, and the user was told nothing.
  assert.match(
    profile,
    /scanCheckFailed/,
    "a failed permission check must be tracked separately from a denial",
  );
  const effect = profile.slice(profile.indexOf("fetchIntakeSession()"));
  assert.match(
    effect.slice(0, 400),
    /setScanCheckFailed\(true\)/,
    "the catch must record that the check failed, not just hide the button",
  );
});
