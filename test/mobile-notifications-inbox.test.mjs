// test/mobile-notifications-inbox.test.mjs
//
// Static wiring guards for the mobile notifications inbox (CI can't run RN
// code — repo pattern is greps over the source, cf. mobile-onboarding.test.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, "..", rel), "utf8");

test("ActivityScreen has the Notifications segment wired to the inbox hook", () => {
  const src = read("apps/mobile/src/screens/ActivityScreen.tsx");
  assert.match(src, /\{ key: "notifications", label: "Notifications" \}/);
  assert.match(src, /useUserNotifications/);
  assert.match(src, /resolveNotificationTarget/);
  assert.match(src, /requestVisitRating/);
  assert.match(src, /markAllRead/);
});

test("ActivityScreen defaults to the Notifications tab", () => {
  const src = read("apps/mobile/src/screens/ActivityScreen.tsx");
  // The segment-array assertion above survives a revert of the *default* tab
  // (e.g. back to "friends") since that string never changes — this pins the
  // actual useState initializer so such a revert fails CI.
  assert.match(src, /useState<Tab>\("notifications"\)/);
});

test("inbox taps route via the existing routing table; visit_rating bypasses it", () => {
  const src = read("apps/mobile/src/screens/ActivityScreen.tsx");
  const visitIdx = src.indexOf('data.type === "visit_rating"');
  const routeIdx = src.indexOf("resolveNotificationTarget(data)");
  assert.ok(visitIdx > 0 && routeIdx > visitIdx, "visit_rating must be handled before generic routing");
});

test("notificationTarget stays the single routing table (no inbox-specific routes added)", () => {
  const src = read("apps/mobile/src/lib/notificationTarget.mjs");
  assert.doesNotMatch(src, /user_notifications/);
});

test("follower notifications land on the Friends segment (owner decision 2026-08-04)", () => {
  // The friend branch must carry the nested segment param, and ActivityScreen
  // must honor it — otherwise a follower tap strands users on the inbox,
  // one segment away from accept/decline.
  const resolver = read("apps/mobile/src/lib/notificationTarget.mjs");
  const friendIdx = resolver.indexOf('type === "friend"');
  const nextBranchIdx = resolver.indexOf('type === "itinerary"');
  assert.ok(friendIdx > 0 && nextBranchIdx > friendIdx);
  assert.match(resolver.slice(friendIdx, nextBranchIdx), /segment:\s*"friends"/);

  const screen = read("apps/mobile/src/screens/ActivityScreen.tsx");
  assert.match(screen, /route\.params[^\n]*\.segment/);
  assert.match(screen, /setTab\(requestedSegment\)/);
});

test("AppNavigator badges the Activity tab from the unread hook", () => {
  const src = read("apps/mobile/src/navigation/AppNavigator.tsx");
  assert.match(src, /useUnreadNotificationsBadge/);
  assert.match(src, /tabBarBadge/);
  assert.match(src, /"99\+"/);
});

test("App.tsx registers the visit-rating bridge", () => {
  const src = read("apps/mobile/App.tsx");
  assert.match(src, /registerVisitRatingHandler/);
});

test("markRead is guarded against clobbering an existing read_at", () => {
  const src = read("apps/mobile/src/hooks/useUserNotifications.ts");
  // .is("read_at", null) also appears in markAllRead (same clobber guard),
  // so a plain whole-file match would still pass if it were deleted from
  // markRead specifically. Scope the check to the markRead closure by
  // slicing the source between its declaration and markAllRead's.
  const markReadStart = src.indexOf("const markRead = useCallback");
  const markAllReadStart = src.indexOf("const markAllRead = useCallback");
  assert.ok(markReadStart > 0 && markAllReadStart > markReadStart, "markRead must precede markAllRead");
  const markReadBody = src.slice(markReadStart, markAllReadStart);
  assert.match(markReadBody, /\.is\("read_at", null\)/, "markRead must guard its update against an already-read row");
  // Task 9 deviation: generated.ts is stale and lacks user_notifications, so
  // the hook casts the client ((supabase as any).from(...)) instead of the
  // brief's untyped supabase.from(...). Match on the table-name substring so
  // this guard covers both call forms and still proves the hook targets the
  // right table.
  assert.match(src, /\.from\("user_notifications"\)/);
});

test("refresh orders the inbox newest-first", () => {
  const src = read("apps/mobile/src/hooks/useUserNotifications.ts");
  assert.match(src, /order\("created_at", \{ ascending: false \}\)/);
});

test("badge hook refreshes on foreground and on the unread bus", () => {
  const src = read("apps/mobile/src/hooks/useUnreadNotificationsBadge.ts");
  assert.match(src, /AppState\.addEventListener/);
  assert.match(src, /onUnreadChanged/);
  assert.match(src, /head: true/);
  assert.match(src, /\.from\("user_notifications"\)/);
});
