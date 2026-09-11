// test/published-at-sites.test.mjs
//
// published_at is only trustworthy if every publish stamps it and every
// unpublish clears it. There are 13 such sites across four files, in three
// different shapes (direct update, shared helper, insert), which is exactly
// the situation that left 0 of 136 menus attributed before piece 1.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
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

test("organization menu publish and unpublish maintain published_at", () => {
  const src = read("apps/web/src/actions/organization-actions.ts");
  assert.match(fnBody(src, "publishOrganizationMenu"), /published_at:/);
  assert.match(fnBody(src, "unpublishOrganizationMenu"), /published_at:\s*null/);
});

test("event publish and unpublish maintain published_at", () => {
  const src = read("apps/web/src/actions/event-actions.ts");
  assert.match(fnBody(src, "publishEvent"), /published_at:/);
  assert.match(fnBody(src, "unpublishEvent"), /published_at:\s*null/);
});

test("the claim route stamps published_at when it publishes", () => {
  const src = read("apps/web/src/app/api/intake/claim/route.ts");
  assert.match(src, /status: 'published'[\s\S]{0,120}?published_at:/);
});

test("intake commit stamps only when it actually publishes", () => {
  // The same expression that chooses 'published' must choose the stamp. An
  // unconditional stamp would date drafts as if they were live, and they would
  // enter the 90-day window without ever being visible to anyone.
  const src = read("apps/web/src/app/api/intake/commit/route.ts");
  assert.match(src, /const publishedAt =/, "one derived value, used by all three inserts");
  assert.match(src, /newWindowRows[\s\S]{0,500}?published_at:/, "window rows need it");
  const menuInsert = src.slice(src.indexOf(".from('menus')"));
  assert.match(menuInsert.slice(0, 700), /published_at:/, "menu insert needs it");
  // Shorthand `publishedAt,` is idiomatic here, so accept either form.
  assert.match(src, /publishedAt,|publishedAt:\s*publishedAt/, "events get it through buildEventRows");
});

test("buildEventRows writes published_at from its options", () => {
  const helper = read("apps/web/src/utils/intake-content.ts");
  assert.match(helper, /publishedAt:\s*string \| null/, "opts must declare it");
  assert.match(helper, /published_at:\s*opts\.publishedAt/, "the row must set it");
});

function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

test("EVERY status change to published also sets published_at", () => {
  // The invariant the per-site tests cannot hold: it fails for a site nobody
  // has written yet.
  //
  // LIMIT, stated so nobody over-trusts this: it can only see a LITERAL
  // status. The intake inserts use computed values (`status: menuStatus`,
  // `status: opts.status`), which this will never match — those are covered by
  // the explicit assertions in the intake test above. This guard is for the
  // common shape: someone adding another `status: 'published'` update.
  const offenders = [];
  for (const file of sourceFiles(join(repoRoot, "apps/web/src"))) {
    const src = readFileSync(file, "utf8");
    const rel = file.replace(repoRoot + "/", "");
    if (!/(menus|happy_hour_windows|venue_events)/.test(src)) continue;

    for (const m of src.matchAll(/status:\s*(HH_STATUS_PUBLISHED|'published')/g)) {
      const around = src.slice(Math.max(0, m.index - 400), m.index + 400);
      if (!/(menus|happy_hour_windows|venue_events)/.test(around)) continue;
      if (!/published_at/.test(around)) {
        offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these publish sites do not set published_at:\n  ${offenders.join("\n  ")}`,
  );
});
