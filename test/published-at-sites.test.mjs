// test/published-at-sites.test.mjs
//
// published_at is only trustworthy if every publish stamps it and every
// unpublish clears it. There are 13 such sites across four files, in three
// different shapes (direct update, shared helper, insert), which is exactly
// the situation that left 0 of 136 menus attributed before piece 1.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/** The body of a named exported or private async function. */
function fnBody(src, name) {
  const i = src.indexOf(`async function ${name}(`);
  assert.notEqual(i, -1, `${name} not found`);
  const rest = src.slice(i);
  const end = rest.indexOf("\n}\n");
  return rest.slice(0, end === -1 ? 2000 : end);
}

const venueActions = read("apps/web/src/actions/venue-actions.ts");

test("venue-actions publish sites stamp published_at", () => {
  for (const fn of ["publishMenu", "publishMenusByIds", "publishHappyHour"]) {
    assert.match(fnBody(venueActions, fn), /published_at:/, `${fn} must stamp published_at`);
  }
});

test("venue-actions unpublish sites clear published_at", () => {
  // Otherwise content unpublished and republished later keeps its original
  // date and can skip or re-enter the 90-day window incorrectly.
  for (const fn of ["unpublishMenu", "unpublishHappyHour"]) {
    assert.match(fnBody(venueActions, fn), /published_at:\s*null/, `${fn} must clear published_at`);
  }
});

test("the shared menu helper stamps once, not at its call sites", () => {
  // publishMenusByIds is reached from publishMenusForWindow and
  // updateHappyHourMenus. Stamping in the helper covers both; stamping at the
  // call sites instead would leave the third caller silently unstamped.
  assert.match(fnBody(venueActions, "publishMenusByIds"), /published_at:/);
  assert.doesNotMatch(
    fnBody(venueActions, "publishMenusForWindow"),
    /published_at:/,
    "the caller must not duplicate the stamp",
  );
});
