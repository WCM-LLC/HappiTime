import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveNotificationTarget } from "./notificationTarget.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("happy_hour with windowId → HappyHourDetail", () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: "happy_hour", windowId: "w1", venueId: "v1" }),
    { screen: "HappyHourDetail", params: { windowId: "w1" } }
  );
});

test("venue with venueId → VenuePreview", () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: "venue", venueId: "v1" }),
    { screen: "VenuePreview", params: { venueId: "v1" } }
  );
});

test("friend → Activity tab", () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: "friend" }),
    { screen: "AppTabs", params: { screen: "Activity" } }
  );
});

test("itinerary with listId → ItineraryDetail", () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: "itinerary", listId: "l1" }),
    { screen: "ItineraryDetail", params: { listId: "l1" } }
  );
});

test("event → EventCalendar (previously an unhandled dead tap)", () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: "event", venueId: "v1", eventId: "e1" }),
    { screen: "EventCalendar", params: undefined }
  );
});

test("unknown/missing/malformed payloads → null", () => {
  assert.equal(resolveNotificationTarget(undefined), null);
  assert.equal(resolveNotificationTarget(null), null);
  assert.equal(resolveNotificationTarget("nope"), null);
  assert.equal(resolveNotificationTarget({}), null);
  assert.equal(resolveNotificationTarget({ type: "visit_rating" }), null); // owned by useVisitRating
  assert.equal(resolveNotificationTarget({ type: "happy_hour" }), null); // missing windowId
  assert.equal(resolveNotificationTarget({ type: "happy_hour", windowId: 7 }), null);
  assert.equal(resolveNotificationTarget({ type: "itinerary" }), null); // missing listId
});

test("every data.type sent by the edge functions has a client route or an explicit owner", () => {
  // Keep this list in sync with supabase/functions/notify-*/index.ts payloads.
  const senderTypes = ["happy_hour", "venue", "friend", "itinerary", "event"];
  for (const type of senderTypes) {
    const target = resolveNotificationTarget({
      type,
      windowId: "w",
      venueId: "v",
      listId: "l",
      eventId: "e",
    });
    assert.ok(target, `sender type "${type}" resolves to no screen — dead tap`);
  }
});

test("useNotificationNavigation polls for nav readiness and does not mark handled before it", () => {
  const source = readFileSync(
    join(__dirname, "..", "hooks", "useNotificationNavigation.ts"),
    "utf8"
  );
  // The cold-start bug: bailing on a single synchronous isReady() check after
  // already recording the notification id as handled.
  assert.match(source, /waitForNav/, "hook must poll nav readiness like useVenueDeepLink");
  assert.doesNotMatch(
    source,
    /lastHandledId\.current = id;[\s\S]{0,200}isReady/,
    "must not mark a tap handled before the readiness check"
  );
});

test("useVisitRating handles cold-start taps", () => {
  const source = readFileSync(
    join(__dirname, "..", "hooks", "useVisitRating.ts"),
    "utf8"
  );
  assert.match(source, /getLastNotificationResponseAsync/);
});
