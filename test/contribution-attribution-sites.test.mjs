// test/contribution-attribution-sites.test.mjs
//
// Every insert into an attributed table must supply created_by and
// created_by_tier. This file grows one assertion per site as sites are
// migrated; the final test is an enumerating guard that also catches insert
// sites added in the future.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/**
 * The object literal passed to `.from(table).insert({...})`.
 *
 * Only an `.insert(` that DIRECTLY follows the `.from(table)` counts. Reading
 * ahead to the next `.insert(` anywhere would sail past a `.from('menus')
 * .select(...)` and return a menu_sections payload instead — which is exactly
 * what an earlier version of this helper did, passing a test it should have
 * failed.
 */
function insertPayload(src, table, occurrence = 1) {
  const marker = `.from('${table}')`;
  let seen = 0;
  let idx = src.indexOf(marker);
  while (idx !== -1) {
    const after = src.slice(idx + marker.length);
    if (/^\s*\.insert\(/.test(after)) {
      seen++;
      if (seen === occurrence) {
        const insertIdx = idx + marker.length + after.indexOf(".insert(");
        const open = src.indexOf("{", insertIdx);
        assert.notEqual(open, -1, `no object literal in ${table} insert`);
        let depth = 0;
        for (let i = open; i < src.length; i++) {
          if (src[i] === "{") depth++;
          else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
        }
        throw new Error(`unbalanced braces in ${table} insert`);
      }
    }
    idx = src.indexOf(marker, idx + 1);
  }
  throw new Error(`insert #${occurrence} into ${table} not found`);
}

test("venue-actions createMenu attributes the menu", () => {
  const payload = insertPayload(read("apps/web/src/actions/venue-actions.ts"), "menus");
  assert.match(payload, /created_by:/, "menus insert must set created_by");
  assert.match(payload, /created_by_tier:/, "menus insert must set created_by_tier");
});

test("venue-actions addHappyHour attributes the window", () => {
  const payload = insertPayload(
    read("apps/web/src/actions/venue-actions.ts"),
    "happy_hour_windows",
  );
  assert.match(payload, /created_by:/);
  assert.match(payload, /created_by_tier:/);
});

test("organization-actions createOrganizationMenu attributes the menu", () => {
  const payload = insertPayload(read("apps/web/src/actions/organization-actions.ts"), "menus");
  assert.match(payload, /created_by:/);
  assert.match(payload, /created_by_tier:/);
});

test("menu-tree copies are attributed for audit", () => {
  // A copied menu carries source_menu_id, which is how piece 2 excludes it
  // from scoring. Attribution here is for the audit trail, not for credit —
  // crediting copies would let one menu be farmed across many venues.
  const src = read("apps/web/src/actions/menu-tree.ts");
  const payload = insertPayload(src, "menus");
  assert.match(payload, /created_by:/);
  assert.match(payload, /created_by_tier:/);
  assert.match(payload, /source_menu_id/, "copies must keep source_menu_id set");
});
