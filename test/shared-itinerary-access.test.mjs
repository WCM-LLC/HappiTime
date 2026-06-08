import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const migration = read(
  "supabase/migrations/20260605120000_shared_itinerary_read_grant.sql"
);

// Regression: tapping an itinerary-share push notification used to route to the
// Favorites tab with `openListId`, which only matches the recipient's OWN lists
// → silent landing on your own Saved screen. The fix grants the recipient read
// access to the shared list and opens it in the dedicated detail screen.

test("itinerary-share notification opens the ItineraryDetail screen, not the owner-only Favorites path", () => {
  const src = read("apps/mobile/src/hooks/useNotificationNavigation.ts");
  assert.match(src, /type === "itinerary"/);
  assert.match(src, /navigate\(\s*["']ItineraryDetail["']/);
  // The broken owner-only reuse must be gone from the itinerary branch.
  assert.doesNotMatch(src, /screen:\s*["']Favorites["'][^}]*openListId/);
});

test("migration adds a SECURITY DEFINER grant predicate that is forgery-proof (share authored by the list owner)", () => {
  assert.match(migration, /function public\.itinerary_shared_with_me/);
  assert.match(migration, /security definer/i);
  // The load-bearing check: the share row must be authored by the list's owner,
  // otherwise any user could insert an itinerary_share row to self-grant access.
  assert.match(migration, /e\.user_id\s*=\s*l\.user_id/);
  assert.match(migration, /shared_with_user_id'\s*=\s*auth\.uid\(\)::text/);
  // Untrusted meta is compared as text, never cast to uuid (no DoS on bad rows).
  assert.doesNotMatch(migration, /meta->>'list_id'\)::uuid/);
});

test("migration extends the list SELECT policies with the shared grant", () => {
  assert.match(
    migration,
    /policy "user_lists_select_owner_or_public"[\s\S]*itinerary_shared_with_me\(id\)/
  );
  assert.match(
    migration,
    /policy "user_list_items_select_owner_or_public"[\s\S]*itinerary_shared_with_me\(list_id\)/
  );
  assert.match(migration, /grant execute on function public\.itinerary_shared_with_me/i);
});

test("migration adds an enumerator RPC (recipient can't read owner-only user_events directly)", () => {
  assert.match(migration, /function public\.list_itineraries_shared_with_me/);
  assert.match(
    migration,
    /grant execute on function public\.list_itineraries_shared_with_me/i
  );
  // Enumerator is also owner-authored-scoped.
  assert.match(migration, /e\.user_id\s*=\s*l\.user_id/);
});

test("useSharedItineraries lists shares via the definer RPC", () => {
  const src = read("apps/mobile/src/hooks/useSharedItineraries.ts");
  assert.match(src, /export function useSharedItineraries/);
  assert.match(src, /\.rpc\(\s*\n?\s*["']list_itineraries_shared_with_me["']/);
});

test("FavoritesScreen lists itineraries shared with the user and opens the detail screen", () => {
  const src = read("apps/mobile/src/screens/FavoritesScreen.tsx");
  assert.match(src, /import \{ SharedItinerarySection \}/);
  assert.match(src, /<SharedItinerarySection/);
  assert.match(src, /navigate\(\s*["']ItineraryDetail["']/);
});

test("usePublicItinerary exposes a header so the notification path can render with only a listId", () => {
  const src = read("apps/mobile/src/hooks/usePublicItinerary.ts");
  assert.match(src, /header/);
  assert.match(src, /from\("user_lists"\)/);
});

test("the shared-itinerary migration is present and idempotent", () => {
  const files = readdirSync(join(repoRoot, "supabase/migrations")).filter((f) =>
    f.endsWith(".sql")
  );
  // Don't pin this as the *latest* migration — that breaks every time a newer
  // migration lands. Just assert it's present and (below) re-runnable.
  assert.ok(
    files.includes("20260605120000_shared_itinerary_read_grant.sql"),
    "shared-itinerary migration should be present in supabase/migrations"
  );
  assert.match(migration, /create or replace function/i);
  assert.match(migration, /drop policy if exists/i);
});
