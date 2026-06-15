// Unit tests for the pure address-match scorer used by validate-venue-places.
// Run: deno test --no-config supabase/functions/_shared/address-match.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeAddress, addressMatchScore } from "./address-match.ts";

Deno.test("normalize expands abbreviations and lowercases", () => {
  assertEquals(normalizeAddress("123 Main St."), "123 main street");
  assertEquals(normalizeAddress("456 W Oak Ave"), "456 west oak avenue");
});

Deno.test("normalize drops suite/unit noise", () => {
  assertEquals(normalizeAddress("123 Main St, Ste 200"), "123 main street");
  assertEquals(normalizeAddress("123 Main St #4B"), "123 main street");
});

Deno.test("identical addresses score 1.0", () => {
  const s = addressMatchScore("123 Main St, Kansas City, MO 64111",
                              "123 Main Street, Kansas City, MO 64111, USA");
  assertEquals(s, 1);
});

Deno.test("St vs Street equivalence does not lower the score", () => {
  const s = addressMatchScore("500 Walnut St, KC, MO 64106",
                              "500 Walnut Street, Kansas City, MO 64106, USA");
  assertEquals(s >= 0.99, true);
});

Deno.test("different street number is flagged below 0.7", () => {
  const s = addressMatchScore("123 Main St, KC, MO 64111",
                              "987 Main Street, Kansas City, MO 64111, USA");
  assertEquals(s < 0.7, true);
});

Deno.test("different zip is flagged below 0.7", () => {
  const s = addressMatchScore("123 Main St, KC, MO 64111",
                              "123 Main Street, Kansas City, MO 64108, USA");
  assertEquals(s < 0.7, true);
});

Deno.test("missing zip on one side renormalizes over number+name", () => {
  const s = addressMatchScore("123 Main St", "123 Main Street, Kansas City, MO");
  assertEquals(s >= 0.99, true);
});
