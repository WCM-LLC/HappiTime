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

/** The object literal passed to the Nth `.from(table).insert({...})` in src. */
function insertPayload(src, table, occurrence = 1) {
  let idx = -1;
  for (let i = 0; i < occurrence; i++) {
    idx = src.indexOf(`.from('${table}')`, idx + 1);
    assert.notEqual(idx, -1, `insert #${occurrence} into ${table} not found`);
  }
  const insertIdx = src.indexOf(".insert(", idx);
  assert.notEqual(insertIdx, -1, `no .insert() after .from('${table}')`);
  const open = src.indexOf("{", insertIdx);
  // Walk braces so nested objects don't truncate the payload.
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in ${table} insert`);
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
