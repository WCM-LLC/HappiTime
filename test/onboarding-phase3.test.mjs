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

const app = readFileSync(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");

test("pre-feed completion writes the guest selections to the durable stash", () => {
  assert.match(app, /setGuestSelections\(/);
  // onDone now receives the guest payload instead of discarding it
  assert.match(app, /onDone=\{async \(guest\)/);
});

const persist = readFileSync(new URL("../apps/mobile/src/hooks/useGuestSelectionPersist.ts", import.meta.url), "utf8");

test("guest selections persist to interests on first session, via a fresh signed-in hook", () => {
  assert.match(persist, /takeGuestSelections\(\)/);           // consume once
  assert.match(persist, /vibesToTagSlugs\(/);                 // map to taxonomy slugs
  assert.match(persist, /savePreferences\(\{[^}]*interests/); // write interests
  assert.match(app, /useGuestSelectionPersist\(\)/);          // mounted at root
});

const home = readFileSync(new URL("../apps/mobile/src/screens/HomeScreen.tsx", import.meta.url), "utf8");

test("guest feed seeds its tag filter from the stashed vibes (peek, once, guests only)", () => {
  assert.match(home, /peekGuestSelections\(\)/);
  assert.match(home, /vibesToTagSlugs\(/);
  assert.match(home, /setSelectedTagSlugs\(/);
  // guarded to guests so a signed-in user's manual filter is never overridden
  assert.match(home, /!user/);
});
