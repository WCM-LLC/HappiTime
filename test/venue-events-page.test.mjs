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
