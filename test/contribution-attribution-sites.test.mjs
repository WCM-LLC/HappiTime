// test/contribution-attribution-sites.test.mjs
//
// Every insert into an attributed table must supply created_by and
// created_by_tier. This file grows one assertion per site as sites are
// migrated; the final test is an enumerating guard that also catches insert
// sites added in the future.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
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

test("event-actions createEvent carries the tier alongside its existing created_by", () => {
  // created_by was already set here — this is why venue_events showed 7 of 152
  // rows attributed while menus and windows showed none.
  const payload = insertPayload(read("apps/web/src/actions/event-actions.ts"), "venue_events");
  assert.match(payload, /created_by:/);
  assert.match(payload, /created_by_tier:/);
});

test("intake commit attributes menus and windows", () => {
  const src = read("apps/web/src/app/api/intake/commit/route.ts");

  // Windows are inserted from a prebuilt array, so assert on its construction
  // rather than the .insert() payload.
  assert.match(src, /newWindowRows[\s\S]{0,400}?created_by:/, "window rows need created_by");
  assert.match(src, /newWindowRows[\s\S]{0,400}?created_by_tier:/, "window rows need the tier");

  const menuPayload = insertPayload(src, "menus");
  assert.match(menuPayload, /created_by:/);
  assert.match(menuPayload, /created_by_tier:/);
});

test("intake events carry the tier through buildEventRows", () => {
  // Events are not built inline. The route passes camelCase options into
  // buildEventRows, which writes the snake_case column — so the two halves are
  // asserted in the two different files that actually contain them.
  const route = read("apps/web/src/app/api/intake/commit/route.ts");
  assert.match(route, /createdByTier:\s*tier/, "route must pass the resolved tier");

  const helper = read("apps/web/src/utils/intake-content.ts");
  assert.match(helper, /createdByTier:\s*ContributorTier/, "opts must declare the tier");
  assert.match(helper, /created_by_tier:\s*opts\.createdByTier/, "row must set the column");
});

test("intake passes the resolved tier, never a hardcoded string", () => {
  // A hardcoded 'owner' here would file every super user's contribution under
  // the wrong tier, and the leaderboard filters on exactly that column.
  const route = read("apps/web/src/app/api/intake/commit/route.ts");
  assert.doesNotMatch(route, /created_by_tier:\s*'(admin|owner|super_user|user)'/);
  assert.doesNotMatch(route, /createdByTier:\s*'(admin|owner|super_user|user)'/);
  assert.match(route, /created_by_tier:\s*tier/, "menu and window rows use the resolved tier");
});

/** Every .ts/.tsx file under apps/web/src. */
function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

test("EVERY insert into an attributed table sets created_by and created_by_tier", () => {
  // The guard the earlier per-site tests cannot provide: it fails for a site
  // nobody has written yet. Attribution was missed for 136 menus because
  // nothing checked, and nothing would have caught the next omission either.
  const ATTRIBUTED = ["menus", "happy_hour_windows", "venue_events"];
  const offenders = [];

  for (const file of sourceFiles(join(repoRoot, "apps/web/src"))) {
    const src = readFileSync(file, "utf8");
    for (const table of ATTRIBUTED) {
      const marker = `.from('${table}')`;
      let idx = src.indexOf(marker);
      while (idx !== -1) {
        const after = src.slice(idx + marker.length);
        // Only inserts are authorship. Selects, updates and deletes are not.
        if (/^\s*\.insert\(/.test(after)) {
          // Two shapes: an inline object literal, or a prebuilt array passed
          // by name. For the latter the attribution lives where the rows are
          // BUILT, which is above the insert — so follow the identifier
          // instead of reading forward and reporting a false positive.
          const argMatch = after.match(/^\s*\.insert\(\s*([A-Za-z_$][\w$]*)\s*\)/);
          let region;
          if (argMatch) {
            const varName = argMatch[1];
            const defIdx = src.search(
              new RegExp(`(const|let|var)\\s+(\\{[^}]*\\b${varName}\\b[^}]*\\}|${varName})\\s*=`),
            );
            region = defIdx === -1 ? "" : src.slice(defIdx, defIdx + 1200);
          } else {
            region = after.slice(0, 1200);
          }
          // camelCase counts too: it means the rows are built by a helper
          // (buildEventRows) whose own test asserts it writes the columns.
          const hasUser = /created_by\b|createdBy\b/.test(region);
          const hasTier = /created_by_tier\b|createdByTier\b/.test(region);
          if (!hasUser || !hasTier) {
            const line = src.slice(0, idx).split("\n").length;
            offenders.push(`${file.replace(repoRoot + "/", "")}:${line} → ${table}`);
          }
        }
        idx = src.indexOf(marker, idx + 1);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these inserts do not attribute their contributor:\n  ${offenders.join("\n  ")}`,
  );
});
