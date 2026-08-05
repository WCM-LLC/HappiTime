// Static guards for the per-venue Events & Specials page
// (spec docs/superpowers/specs/2026-08-05-venue-events-page-design.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("Event Calendar More info navigates in-app to VenueEvents, never the venue website", () => {
  const src = read("apps/mobile/src/screens/EventCalendarScreen.tsx");
  assert.doesNotMatch(src, /Linking\.openURL\(ev\.external_url/);
  assert.match(src, /navigate\("VenueEvents"/);
  assert.match(src, /Linking\.openURL\(ev\.ticket_url/); // tickets stay external
});

test("event notifications route to the venue's events page with calendar fallback", () => {
  const resolver = read("apps/mobile/src/lib/notificationTarget.mjs");
  const evIdx = resolver.indexOf('type === "event"');
  assert.ok(evIdx > 0);
  // fromIndex=evIdx: the resolver's top-of-function guard clause
  // (`if (!data...) return null;`) also matches the bare string "return
  // null" earlier in the file, before the event branch — an unanchored
  // indexOf would find that guard instead and always slice to "".
  const branch = resolver.slice(evIdx, resolver.indexOf("return null", evIdx));
  assert.match(branch, /screen:\s*"VenueEvents"/);
  assert.match(branch, /screen:\s*"EventCalendar"/); // old payloads keep working
});

test("Venue Preview caps inline events at 3 with a see-all link; no website More info", () => {
  const src = read("apps/mobile/src/screens/VenuePreviewScreen.tsx");
  assert.match(src, /events\.slice\(0,\s*3\)/);
  assert.match(src, /See all events & specials →/);
  assert.match(src, /navigate\("VenueEvents"/);
  assert.doesNotMatch(src, /Linking\.openURL\(ev\.external_url/);
});

test("menus hint says 'Tap here to see menus' and sits with the windows list", () => {
  const src = read("apps/mobile/src/screens/VenuePreviewScreen.tsx");
  assert.doesNotMatch(src, /Tap below to see Menus/i);
  const hintIdx = src.indexOf("Tap here to see menus");
  const windowsIdx = src.indexOf("data={windowsForVenue}");
  assert.ok(hintIdx > 0 && windowsIdx > 0, "hint and windows list must both exist");
  // The hint renders in the windows-list region, not up by the check-in buttons:
  // it must appear AFTER the check-in button block in source order.
  const checkInIdx = src.indexOf("I'm here 🍻");
  assert.ok(hintIdx > checkInIdx, "hint must come after the check-in buttons");
  assert.ok(hintIdx < windowsIdx, "hint must come before the windows list");
});
