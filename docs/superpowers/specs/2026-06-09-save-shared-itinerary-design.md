# Save a Shared Itinerary (copy) — Design

**Status:** Approved.
**Date:** 2026-06-09
**Goal:** Let a viewer of a shared itinerary (universal-link `SharedItineraryScreen`) **copy** it
into their own itineraries, and offer the same Save when viewing it on the Map. OTA-shippable
(RPC deploys on merge + JS via OTA) — reaches 1.0.4 users without a rebuild.

Context: both itinerary viewers were read-only; no copy RPC existed. `get_shared_itinerary`
returned a lean venue payload (no lat/lng) so the shared itinerary could not be mapped.

## Data (migration `20260609220000`)
1. **Expand `get_shared_itinerary(p_token)`** (CREATE OR REPLACE, backward-compatible — the web
   viewer ignores extra keys). Each item additionally returns the `ItineraryMapVenue` fields:
   `org_name, zip, timezone, tags, app_name_preference, status, lat, lng, phone, website,
   facebook_url, instagram_url, tiktok_url, promotion_tier, promotion_priority` (on top of the
   existing `venue_id, name, slug, address, neighborhood, city, state, cuisine_type, price_tier,
   notes`).
2. **New `copy_shared_itinerary(p_token uuid) returns uuid`** — `SECURITY DEFINER` plpgsql,
   `EXECUTE` to `authenticated` only:
   - raise if `auth.uid()` is null (UI prompts sign-in);
   - read source `user_lists` by `share_token`; return null for a bad token;
   - insert a new `user_lists` (`user_id = auth.uid()`, name `left(name || ' (saved)', 100)`,
     same `description`, `visibility='private'`);
   - copy all `user_list_items` (`venue_id, sort_order, notes`);
   - return the new `list_id`.

## Client
- **`useSaveSharedItinerary()` hook** (DRY — used by both screens): `save(token)` →
  `{ ok, listId?, needsAuth?, error? }`. Not signed in → `needsAuth`. Wraps the RPC; never throws.
- **`SharedItineraryScreen`**: add **"Save to my itineraries"** + **"View on map"**.
  - Save → `useSaveSharedItinerary`; `needsAuth` → navigate `Auth`; `ok` → navigate
    `AppTabs › Favorites { openListId, tab:'lists' }`; error → `Alert`.
  - View on map → build `ItineraryMapVenue[]` from the (now lat/lng-bearing) items and navigate
    `AppTabs › Map { itineraryVenues, itineraryVenueIds, itineraryName, itineraryShareToken,
    itineraryRequestId }`. If no item has coords, show the same "No map pins yet" alert as
    `ItineraryDetailScreen`.
- **`MapScreen`**: read `itineraryShareToken`; when present, render a **"Save"** action in the
  existing itinerary banner (next to "Clear") that runs the identical `useSaveSharedItinerary`
  flow. Absent (insider/friend itineraries) → banner unchanged.
- **`MainTabParamList.Map`** params gain `itineraryShareToken?: string`.

## Scope
- Token-based shared path only (`SharedItineraryScreen` + Map). The in-app friend-share viewer
  (`ItineraryDetailScreen`, list-id/RLS-based) is a separate fast-follow (needs a copy-by-id RPC
  with an access check).
- Duplicate saves create another copy (no source-tracking — YAGNI).

## Error handling
RPC/auth/copy failure → `Alert` + no navigation; never crashes the viewer or the map.

## Testing
- Prod ROLLBACK dry-runs: `copy_shared_itinerary` (new list owned by caller + items copied;
  bad token→null; unauth→error) and expanded `get_shared_itinerary` (payload includes lat/lng).
- `tsc --noEmit` clean across the touched files.
- Manual: Save from the list view AND from the map banner; "View on map" plots the pins.
