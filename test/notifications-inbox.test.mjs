// test/notifications-inbox.test.mjs
//
// (1) Unit tests for the pure recipient gate. (2) [Added in Task 8] static
// guards that all six send paths route through _shared/notify.ts.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { categoryGatedRecipients } from "../supabase/functions/_shared/notify-recipients.mjs";

test("dedups ids and drops falsy ones", () => {
  assert.deepEqual(
    categoryGatedRecipients(["a", "a", null, "", "b"], [], "notifications_friend_activity"),
    [{ userId: "a" }, { userId: "b" }]
  );
});

test("drops users who disabled the category; missing pref row = opted in", () => {
  const prefs = [
    { user_id: "a", notifications_friend_activity: false },
    { user_id: "b", notifications_friend_activity: true },
  ];
  assert.deepEqual(
    categoryGatedRecipients(["a", "b", "c"], prefs, "notifications_friend_activity"),
    [{ userId: "b" }, { userId: "c" }]
  );
});

test("notifications_push is NOT a row gate (push-only, handled by the helper)", () => {
  const prefs = [{ user_id: "a", notifications_push: false }];
  assert.deepEqual(
    categoryGatedRecipients(["a"], prefs, "notifications_friend_activity"),
    [{ userId: "a" }]
  );
});

test("null categoryKey skips gating entirely", () => {
  const prefs = [{ user_id: "a", notifications_friend_activity: false }];
  assert.deepEqual(categoryGatedRecipients(["a"], prefs, null), [{ userId: "a" }]);
});

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const readFn = (name) =>
  readFileSync(join(__dirname2, "..", "supabase/functions", name, "index.ts"), "utf8");

const SENDERS = [
  "notify-friend-activity",
  "notify-venue-updates",
  "notify-upcoming-happy-hours",
  "notify-upcoming-events",
  "evaluate-visit-ratings",
  "track-visit",
];

test("all six send paths route through the shared inbox helper", () => {
  for (const name of SENDERS) {
    const src = readFn(name);
    assert.match(src, /from "\.\.\/_shared\/notify\.ts"/, `${name} must import notify.ts`);
    assert.match(src, /sendUserNotifications\(/, `${name} must call sendUserNotifications`);
  }
});

test("no sender talks to Expo directly (exp.host lives only in expo-push.ts)", () => {
  for (const name of SENDERS) {
    assert.doesNotMatch(readFn(name), /exp\.host/, `${name} must not hand-roll Expo pushes`);
  }
});

test("the helper inserts before pushing and applies the push-only gate", () => {
  const src = readFileSync(
    join(__dirname2, "..", "supabase/functions/_shared/notify.ts"),
    "utf8"
  );
  const insertIdx = src.indexOf('from("user_notifications").insert');
  const pushIdx = src.indexOf("sendExpoPush(");
  assert.ok(insertIdx > 0 && pushIdx > insertIdx, "inbox insert must precede the push");
  assert.match(src, /notifications_push/);
  assert.match(src, /ExponentPushToken/);
});

test("the helper applies the push policy (quiet hours + daily cap) after the insert, push-only", () => {
  const src = readFileSync(
    join(__dirname2, "..", "supabase/functions/_shared/notify.ts"),
    "utf8"
  );
  assert.match(src, /from "\.\/push-policy\.ts"/, "policy lives in push-policy.ts");
  const insertIdx = src.indexOf('from("user_notifications").insert');
  const quietIdx = src.indexOf("isQuietHours(");
  const capIdx = src.indexOf("allowedPushCount(");
  const pushIdx = src.indexOf("sendExpoPush(");
  assert.ok(insertIdx > 0 && quietIdx > insertIdx, "quiet-hours check must come after the inbox insert");
  assert.ok(capIdx > insertIdx && pushIdx > capIdx, "cap check must sit between insert and push");
  // pushed_at is stamped only after Expo accepted, and only on rows we pushed
  const stampIdx = src.indexOf("pushed_at: now.toISOString()");
  assert.ok(stampIdx > pushIdx, "pushed_at is written after sendExpoPush");
  assert.match(src, /suppressedQuiet/);
  assert.match(src, /suppressedCap/);
});
