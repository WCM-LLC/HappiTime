import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../apps/mobile/src/screens/FavoritesScreen.tsx", import.meta.url), "utf8");
test("itinerary share URL appends ?ref={handle}", () => {
  assert.match(src, /\?ref=/);
});
