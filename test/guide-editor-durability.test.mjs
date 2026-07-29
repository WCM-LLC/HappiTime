/**
 * guide-editor-durability.test.mjs
 *
 * Guards against the class of bug that ate Bri Baker's guide (2026-07-28):
 * the editor held the ONLY copy of the markdown body in client state, and
 * every new-guide failure path (Submit before save → missing_guide_id,
 * title/body validation, session expiry) redirected away from the form,
 * destroying everything typed.
 *
 * Three defenses, each asserted here:
 *  1. A localStorage backup of the form (pure logic in guideDraftBackup.mjs,
 *     behaviourally tested below) that survives any redirect.
 *  2. "Submit for review" is not rendered until the draft row exists.
 *  3. New-guide validation failures redirect back to /dashboard/guides/new
 *     (which renders the error), never to the list page.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  backupKey,
  buildBackup,
  classifyBackup,
} from "../apps/web/src/utils/guideDraftBackup.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

// ── 1. Backup pure logic ──────────────────────────────────────────────────────

test("backupKey scopes per guide, with 'new' for unsaved drafts", () => {
  assert.equal(backupKey(undefined), "ht.guide.backup.new");
  assert.equal(backupKey(null), "ht.guide.backup.new");
  assert.equal(backupKey("abc-123"), "ht.guide.backup.abc-123");
});

test("an empty backup is 'none' — nothing worth restoring", () => {
  assert.equal(classifyBackup(null, ""), "none");
  assert.equal(classifyBackup(undefined, ""), "none");
  const empty = buildBackup({ title: "", body_md: "" }, 1000);
  assert.equal(classifyBackup(empty, ""), "none");
});

test("a backup matching the server copy is 'stale' — clear it silently", () => {
  const b = buildBackup({ title: "T", body_md: "# saved already" }, 1000);
  assert.equal(classifyBackup(b, "# saved already"), "stale");
});

test("a backup with unsaved body text is 'restorable'", () => {
  const b = buildBackup({ title: "T", body_md: "# my writing" }, 1000);
  assert.equal(classifyBackup(b, ""), "restorable");
  assert.equal(classifyBackup(b, "# older server copy"), "restorable");
});

test("malformed persisted JSON classifies as 'none', never throws", () => {
  assert.equal(classifyBackup("not-an-object", ""), "none");
  assert.equal(classifyBackup({ fields: null }, ""), "none");
  assert.equal(classifyBackup({ fields: { body_md: 42 } }, ""), "none");
});

// ── 2. Editor wiring (static guards) ─────────────────────────────────────────

const editor = read("apps/web/src/app/dashboard/guides/components/GuideEditor.tsx");

test("Submit for review requires a saved draft id", () => {
  // Clicking Submit on /new (no row yet) hit missing_guide_id and redirected
  // to the list, destroying the typed guide.
  assert.match(editor, /canSubmit\s*=\s*showSubmit && status === 'draft' && Boolean\(id\)/);
});

test("the editor persists a localStorage backup", () => {
  assert.match(editor, /guideDraftBackup/);
  assert.match(editor, /localStorage/);
});

// ── 3. Action redirects keep the author on the editor ────────────────────────

const actions = read("apps/web/src/actions/guide-actions.ts");

test("new-guide failures redirect to /dashboard/guides/new, not the list", () => {
  assert.match(actions, /\/dashboard\/guides\/new\?error=title_required/);
  assert.match(actions, /\/dashboard\/guides\/new\?error=body_required/);
  assert.match(actions, /\/dashboard\/guides\/new\?error=save_failed/);
  assert.match(actions, /\/dashboard\/guides\/new\?error=\$\{code\}/);
  // The old list-page destinations for these codes must not come back.
  assert.doesNotMatch(actions, /\/dashboard\/guides\?error=title_required/);
  assert.doesNotMatch(actions, /\/dashboard\/guides\?error=body_required/);
  assert.doesNotMatch(actions, /\/dashboard\/guides\?error=save_failed/);
});

test("/dashboard/guides/new renders the error it is redirected to", () => {
  const newPage = read("apps/web/src/app/dashboard/guides/new/page.tsx");
  assert.match(newPage, /searchParams/);
  assert.match(newPage, /errorText/);
});
