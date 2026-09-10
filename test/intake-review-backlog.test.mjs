// test/intake-review-backlog.test.mjs
//
// Since #178, approving does not publish. Since the scoring model counts
// published content only, an approved submission whose menu is never
// published is worth zero to its contributor — permanently and silently.
//
// The review queue therefore has to show what is waiting on a publish.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  join(__dirname, "..", "apps/web/src/app/orgs/[orgId]/intake-review/page.tsx"),
  "utf8",
);

test("the review queue counts approved submissions still unpublished", () => {
  assert.match(page, /awaitingPublish/, "the backlog must be computed");
  assert.match(page, /'approved'/, "it counts approved submissions");
});

test("the backlog is shown, not just computed", () => {
  const idx = page.indexOf("awaitingPublish");
  assert.notEqual(idx, -1);
  // It has to appear in rendered output, or it is a variable nobody reads.
  assert.match(page.slice(idx), /\{awaitingPublish/, "must be rendered");
});
