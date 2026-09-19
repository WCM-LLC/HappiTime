// test/contributor-leaderboard-page.test.mjs
//
// Three things about this page are load-bearing and easy to undo by accident:
// the toggle, the choice of client, and the empty state.
//
// The client matters most. Reaching for getServiceClient() — as the venue page
// does, because venue_toastmakers is not granted to anon — would put a
// service-role key on a public cacheable route and silently undo the boundary
// the RPC exists to provide.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(__dirname, "..", p), "utf8");
const page = read("apps/directory/src/app/leaderboard/page.tsx");

test("the flag must be exactly 'true' or the route 404s", () => {
  assert.match(page, /LEADERBOARD_ENABLED !== "true"\) notFound\(\)/);
});

test("the flag is server-side, never NEXT_PUBLIC_", () => {
  // A NEXT_PUBLIC_ flag ships to the browser and advertises an unlaunched
  // feature in the client bundle.
  assert.doesNotMatch(page, /NEXT_PUBLIC_LEADERBOARD/);
});

test("it reads with the anon client, not the service-role one", () => {
  assert.match(page, /from "@\/lib\/supabase"/, "must import the anon client");
  assert.doesNotMatch(page, /getServiceClient|SUPABASE_SERVICE_ROLE_KEY/,
    "a public cacheable page must not hold a service-role key");
});

test("it calls the RPC rather than the scoring view", () => {
  assert.match(page, /rpc\("contributor_leaderboard"/);
  assert.doesNotMatch(page, /from\(["']contributor_scores["']/,
    "the view is revoked from anon; reading it directly would just fail");
});

test("it caches like the rest of the directory", () => {
  assert.match(page, /export const revalidate = 900/);
});

test("a failed read throws instead of caching a false empty board", () => {
  // Rendering the empty state on error would tell every visitor for the next
  // 15 minutes that nobody has contributed. Throwing keeps the last good page.
  assert.match(page, /if \(error\) throw/);
});

test("the empty state explains rather than showing an empty table", () => {
  // The board ships empty. This is the screen everyone sees on day one.
  assert.match(page, /rows\.length === 0/);
  assert.match(page, /No rankings yet/);
});

test("the nav link is gated by the same flag as the page", () => {
  // A link to a 404 is worse than no link. The layout (a server component)
  // reads the flag and passes only a boolean to the client nav.
  const nav = read("apps/directory/src/components/SiteNav.tsx");
  assert.match(nav, /href="\/leaderboard\/"/);
  assert.match(nav, /showLeaderboard/);
  assert.doesNotMatch(nav, /LEADERBOARD_ENABLED/, "the client nav must not read the env var");

  const layout = read("apps/directory/src/app/layout.tsx");
  assert.match(layout, /showLeaderboard=\{process\.env\.LEADERBOARD_ENABLED === "true"\}/);
});

test("the title leaves the brand suffix to the layout template", () => {
  // layout.tsx sets template "%s | HappiTime"; naming the brand here too
  // rendered "Top Contributors — HappiTime | HappiTime".
  assert.match(page, /^  title: "Top Contributors",$/m);
});

test("the flag is documented for operators", () => {
  const env = read("apps/directory/.env.example");
  assert.match(env, /LEADERBOARD_ENABLED/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_LEADERBOARD_ENABLED/);
});
