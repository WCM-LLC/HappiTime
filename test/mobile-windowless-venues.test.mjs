import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

test("AddToItinerarySheet component exists and takes a venueId prop", () => {
  const src = read("apps/mobile/src/components/AddToItinerarySheet.tsx");
  assert.match(src, /export const AddToItinerarySheet/);
  assert.match(src, /venueId/);
  assert.match(src, /useUserLists/);
  // Owns the picker + create-list flow it was extracted from.
  assert.match(src, /Add to Itinerary/);
  assert.match(src, /createList/);
  assert.match(src, /addVenue/);
});

test("HappyHourDetailScreen delegates add-to-itinerary to the shared component", () => {
  const src = read("apps/mobile/src/screens/HappyHourDetailScreen.tsx");
  assert.match(src, /import \{ AddToItinerarySheet \}/);
  assert.match(src, /<AddToItinerarySheet\s+venueId=\{venueId\}\s*\/>/);
  // Inline picker state was removed from the screen.
  assert.doesNotMatch(src, /setShowItineraryPicker/);
  assert.doesNotMatch(src, /const pickerStyles = StyleSheet\.create/);
});

test("VenuePreviewScreen fetches venue by id and renders Add above the empty-state gate", () => {
  const src = read("apps/mobile/src/screens/VenuePreviewScreen.tsx");
  assert.match(src, /import \{ AddToItinerarySheet \}/);
  assert.match(src, /fetchVenueById/);
  assert.match(src, /<AddToItinerarySheet\s+venueId=\{venueId\}\s*\/>/);
  // Name no longer depends solely on a happy-hour window.
  assert.match(src, /fetchedVenueName/);
});
