// test/mobile-itinerary-touch.test.mjs
//
// The mobile half of Insider check-in attribution: both itinerary screens must
// tell the backend when an itinerary is opened and when a venue in it is
// tapped, or record_itinerary_touch has no callers and only saves earn credit.
//
// WHAT THIS IS NOT: proof the calls fire on a device. It is a static check that
// the wiring exists and that the helper cannot break navigation.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const helper = read("apps/mobile/src/api/itineraryTouch.ts");
const detail = read("apps/mobile/src/screens/ItineraryDetailScreen.tsx");
const shared = read("apps/mobile/src/screens/SharedItineraryScreen.tsx");
const migration = read("supabase/migrations/20261011031500_super_user_checkin_influence.sql");

test("the helper calls the RPC with the parameter names the migration declares", () => {
  assert.match(helper, /rpc\(\s*"record_itinerary_touch"/);
  for (const param of ["p_list_id", "p_venue_id"]) {
    assert.match(helper, new RegExp(`${param}:`), `helper sends ${param}`);
    assert.match(migration, new RegExp(`\\b${param}\\s+uuid`), `migration declares ${param}`);
  }
});

test("the helper is fire-and-forget: returns void, swallows errors, skips signed-out viewers", () => {
  assert.match(helper, /export function recordItineraryTouch\(listId: string, venueId\?: string\): void/);
  assert.doesNotMatch(helper, /export async function/, "callers must not be able to await it");
  assert.match(helper, /catch \{/);
  assert.match(helper, /if \(!data\.session\) return;/, "the RPC raises without a user");
});

test("the helper never names the Insider — the server derives it from the list", () => {
  assert.doesNotMatch(helper, /super_user|owner|author/i);
});

test("ItineraryDetail logs the open only once venues are on screen, and every venue tap", () => {
  // A failed or abandoned load rendered nothing, so it must not create touches.
  assert.match(detail, /const venuesShown = !loading && !error && venues\.length > 0;/);
  assert.match(
    detail,
    /useEffect\(\(\) => \{\s*if \(venuesShown\) recordItineraryTouch\(listId\);\s*\}, \[listId, venuesShown\]\)/,
  );
  const tap = detail.slice(detail.indexOf("const handleOpenVenue"));
  assert.match(tap.slice(0, tap.indexOf("};")), /recordItineraryTouch\(listId, venueId\)/);
});

test("SharedItinerary logs the open once the token resolves to a list id, and every venue tap", () => {
  assert.match(shared, /const sharedListId = itinerary\?\.id;/);
  assert.match(shared, /if \(sharedListId\) recordItineraryTouch\(sharedListId\);\s*\}, \[sharedListId\]\)/);
  assert.match(shared, /recordItineraryTouch\(itinerary\.id, item\.venue_id\)/);
  // Hooks must stay above the screen's early returns.
  assert.ok(
    shared.indexOf("recordItineraryTouch(sharedListId)") < shared.indexOf('if (status === "loading")'),
    "the effect is declared before the loading early-return",
  );
});
