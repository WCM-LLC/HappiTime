import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const map = readFileSync(new URL("../apps/mobile/src/lib/vibeTagMap.ts", import.meta.url), "utf8");

test("vibeTagMap covers every onboarding vibe key with a real approved_tags slug", () => {
  // The 9 onboarding keys from VibePickerScreen.tsx must each map to an
  // approved_tags slug (hyphenated taxonomy), not the bare onboarding key.
  for (const [key, slug] of [
    ["dive", "dive-bar"],
    ["cocktails", "cocktail-bar"],
    ["patio", "patio"],
    ["rooftop", "rooftop"],
    ["sports", "sports-bar"],
    ["late", "late-night"],
    ["brewery", "brewery"],
    ["margs", "margaritas"],
    ["wine", "wine-bar"],
  ]) {
    assert.match(map, new RegExp(`["']${key}["']\\s*:\\s*["']${slug}["']`));
  }
  assert.match(map, /export function vibesToTagSlugs/);
});

const guest = readFileSync(new URL("../apps/mobile/src/lib/guestSelections.ts", import.meta.url), "utf8");

test("guestSelections is a durable AsyncStorage stash with take-clears semantics", () => {
  assert.match(guest, /AsyncStorage/);                 // durable across restart
  assert.match(guest, /ht_guest_selections/);          // stable key
  assert.match(guest, /export async function setGuestSelections/);
  assert.match(guest, /export async function peekGuestSelections/); // read, no clear (feed)
  assert.match(guest, /export async function takeGuestSelections/); // read + clear (signup)
  assert.match(guest, /removeItem/);                   // take clears
});
