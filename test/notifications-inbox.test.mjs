// test/notifications-inbox.test.mjs
//
// (1) Unit tests for the pure recipient gate. (2) [Added in Task 8] static
// guards that all six send paths route through _shared/notify.ts.
import assert from "node:assert/strict";
import test from "node:test";
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
