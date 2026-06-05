import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

// Regression: tapping a super-user itinerary used to navigate to the Favorites
// tab with `openListId`, which only matches the *current user's own* lists
// (useUserLists is `.eq("user_id", user.id)`). A non-owned public itinerary was
// never found, so it silently dumped you on your own "Saved" screen.
// The fix routes to a dedicated read-only ItineraryDetail screen instead.

test("ActivityScreen opens a super-user itinerary via the ItineraryDetail route, not the owner-only Favorites path", () => {
  const src = read("apps/mobile/src/screens/ActivityScreen.tsx");
  // The tap handler must navigate to the dedicated detail screen.
  assert.match(src, /navigation\.navigate\(\s*["']ItineraryDetail["']/);
  // The broken owner-only reuse must be gone from the itinerary tap handler.
  const handler = src.slice(src.indexOf("handleOpenItinerary"));
  assert.doesNotMatch(
    handler.slice(0, handler.indexOf("};")),
    /openListId/,
    "handleOpenItinerary must not route through the Favorites openListId mechanism"
  );
});

test("ItineraryDetail route is declared in the navigation param list with the itinerary id", () => {
  const src = read("apps/mobile/src/navigation/types.ts");
  assert.match(src, /ItineraryDetail\s*:/);
  assert.match(src, /listId\s*:\s*string/);
});

test("ItineraryDetail screen is registered in the root stack navigator", () => {
  const src = read("apps/mobile/src/navigation/AppNavigator.tsx");
  assert.match(src, /import \{ ItineraryDetailScreen \}/);
  assert.match(src, /name="ItineraryDetail"/);
  assert.match(src, /component=\{ItineraryDetailScreen\}/);
});

test("usePublicItinerary fetches a list's items by list_id (RLS gates non-owned reads)", () => {
  const src = read("apps/mobile/src/hooks/usePublicItinerary.ts");
  assert.match(src, /export function usePublicItinerary/);
  // The items query is filtered by list_id, not by owner — RLS ("owner,
  // public, or shared") authorizes the read. Isolate the items query so the
  // header's author-profile lookup (which does filter by user_id) is excluded.
  const itemsQuery = src.slice(src.indexOf('.from("user_list_items")'));
  assert.match(itemsQuery, /\.eq\(\s*["']list_id["']/);
  assert.doesNotMatch(
    itemsQuery.slice(0, itemsQuery.indexOf(".eq(") + 40),
    /\.eq\(\s*["']user_id["']/
  );
});

test("ItineraryDetailScreen renders a read-only view backed by usePublicItinerary", () => {
  const src = read("apps/mobile/src/screens/ItineraryDetailScreen.tsx");
  assert.match(src, /export const ItineraryDetailScreen/);
  assert.match(src, /usePublicItinerary/);
  // Tapping a venue opens its preview.
  assert.match(src, /navigate\(\s*["']VenuePreview["']/);
  // "View on map" hands the venues to the Map tab.
  assert.match(src, /itineraryVenues/);
  assert.match(src, /screen:\s*["']Map["']/);
});
