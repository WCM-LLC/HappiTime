# Mobile: make window-less venues searchable & addable

**Date:** 2026-06-02
**Status:** Design approved, pending spec review
**Branch:** `feat/mobile-windowless-venues-addable`

## Problem

Searching for venues like **Cortadito Cuban Cafe** and **Dos Lokos Sports Cantina**
in the mobile app returns no cards, and they cannot be added to an itinerary —
even though they appear on the website and exist in the database.

### Root cause (confirmed against prod data + code)

These are Google-Places-imported venues (`places_id` set, created 2026-05-28) that
are `status = 'published'`, geocoded, anon-visible (RLS `venues_select_public`), and
returned correctly by the mobile search SQL. The decisive fact: **both have zero
`happy_hour_windows`.**

The mobile app is built around happy-hour **windows**, not venues
(`useHappyHours()` feeds the map; `MapScreen` only renders a venue by wrapping it in
a synthetic window via `createVenueWindow`). The website shows these venues because
the web has direct venue pages that do not require a happy hour to exist. That
asymmetry is the "web yes / mobile no" report.

A window-less venue can only reach the mobile map through the direct venue-search
path (`MapScreen.tsx:380-446`). Two gaps make these venues unreachable in the
itinerary-building flow the user was in:

- **G1 — search disabled in itinerary mode.** `MapScreen.tsx:383`:
  ```ts
  if (hasItineraryFilter || directVenueSearchNeedles.length === 0) {
    setSearchedVenues([]);   // direct venue search switched OFF
    return;
  }
  ```
  When an itinerary is open on the map (`hasItineraryFilter`), `mappableWindows` is
  built only from itinerary venues + their windows; `searchedVenues` is ignored, so
  window-less venues cannot be found.

- **G2 — no add affordance on the screen map cards open.** `handleCardPress`
  navigates to `VenuePreview`, which has **no** "Add to Itinerary" button. The only
  `addVenue` UI lives in `HappyHourDetailScreen`, which a window-less venue cannot
  open (no real window). Net: a window-less venue is currently un-addable anywhere.

This is not a regression or a data bug — it is a structural product gap. Desired
behavior (confirmed with user): **any published venue should be fully searchable and
addable on mobile, independent of whether it has a happy hour.**

### Regression hypothesis ruled out (evidence)

"No longer show up" was investigated as a possible regression (both rows share an
identical `updated_at` of 2026-06-02 17:37, and `ingest-venues/index.ts` is
modified-uncommitted). Ruled out:

- `ingest-venues` never touches `happy_hour_windows` (writes only `venues` /
  `staging_venues`); its uncommitted diff is pure TypeScript type annotations, no
  logic change.
- `happy_hour_windows` has no soft-delete columns; no sibling/duplicate venue holds
  windows for these names; zero window rows of any status reference these venue IDs.
- 49 of 223 Places-imported venues are window-less (22%); all 18 non-Places venues
  have windows. These two are part of a large population, not singled out.
- The 17:37 update touched only these 2 venues, but `places_last_synced_at` is
  2026-05-28 — not a Places sync, and irrelevant to windows.

### Delivery phasing

- **Phase 1 (this plan — the reported fix):** `AddToItinerarySheet` extraction +
  reuse on `VenuePreviewScreen`; MapScreen G1 search-merge; `VenuePreviewScreen`
  renders the venue **name + Add button above the empty-state gate** so window-less
  venues are addable. Plus simulator verification in itinerary mode.
- **Phase 2 (follow-up plan/PR):** full venue-detail parity for window-less venues
  (address, phone, website, socials, media via `fetchVenueById`), decoupling
  `VenuePreviewScreen`'s identity source from happy-hour windows. Net-new venue-header
  UI affecting all venues — out of scope for the reported bug.

## Approach

Approach 1 (selected): universal "Add to Itinerary" on the venue detail screen, plus
let venue search coexist with an open itinerary on the map. Keeps the app's existing
"add from a venue detail screen" mental model
(`FavoritesScreen.tsx:693`); does not introduce an inline map-card add button.

## Component changes

### 1. New shared component: `apps/mobile/src/components/AddToItinerarySheet.tsx`

Extract the existing "Add to Itinerary" button + picker `Modal` + create-new-list
form (and associated state) out of `HappyHourDetailScreen` (~lines 595–804 and the
`useState` block at 70–77). Single public prop: `venueId: string`. Owns its own
`useUserLists()`, picker/modal visibility state, `addedToIds` / `addingToId`
tracking, and the create-list flow.

- Refactor `HappyHourDetailScreen` to render `<AddToItinerarySheet venueId={venueId} />`
  and delete the inline copy (behavior unchanged).
- Add `<AddToItinerarySheet venueId={venueId} />` to `VenuePreviewScreen`
  (`venueId` already available from `route.params`).
  **Caveat:** `VenuePreviewScreen.tsx:268` gates the *entire* screen behind
  `windowsForVenue.length === 0 && events.length === 0`, and derives the venue name
  from `windowsForVenue[0]?.venue?.name` (line 139). For a window-less venue this
  shows only "doesn't have any published happy hours or events yet" — no name, no
  actions. Phase 1 therefore also: fetches the venue name by `venueId` (e.g.
  `fetchVenueById` from `@happitime/shared-api`) and renders the **name + Add button
  above** the empty-state conditional, leaving only the happy-hours/events *list*
  behind the gate. (Full header parity — address/phone/socials/media — is Phase 2.)

Isolation win: one tested implementation, two consumers, net less code.

### 2. `MapScreen`: let venue search coexist with an open itinerary (G1)

- **Search effect (line 383):** remove the `hasItineraryFilter ||` clause from the
  short-circuit so the direct venue query still runs while an itinerary is open
  (still a no-op when `directVenueSearchNeedles.length === 0`). Update the effect
  dependency list accordingly.
- **`mappableWindows` itinerary branch (470–499):** after building the itinerary
  windows, merge in `searchedVenues` — dedupe against the itinerary venue IDs and
  any window venue IDs already seen, require non-null `lat`/`lng`, wrap via
  `createVenueWindow`. This mirrors the existing discover-branch merge (454–467).
- **Camera-fit guard:** compute `itineraryCoordinates` (561–566) from the itinerary
  venues only (e.g. `combinedItineraryVenues`), not from `filtered`, so search-result
  pins do not hijack the "fit to itinerary" zoom. The itinerary banner and
  `missingCoordinateCount` already derive from `combinedItineraryVenues` and are
  unaffected.

## Data flow (add)

`VenuePreview` has `venueId` from `route.params` → `AddToItinerarySheet` →
`useUserLists().addVenue(listId, venueId)` → upsert into `user_list_items`
(on-conflict `list_id,venue_id`). No DB, RLS, or schema changes — venues are already
published and addable.

## Testing

- **Pure logic:** extract the itinerary search-merge into a pure helper
  (e.g. `mergeSearchVenuesIntoItinerary(itineraryWindows, searchedVenues, seenIds)`)
  and unit-test it under root `test/*.test.mjs` (`node --test`, inside the CI glob).
  Cover: dedupe against itinerary IDs, skip missing coords, preserve itinerary order.
- **Source-introspection tests** (existing style, read source + assert): `MapScreen.tsx`
  no longer short-circuits venue search on `hasItineraryFilter`; `VenuePreviewScreen`
  renders `AddToItinerarySheet`.
- **Simulator verification (explicitly requested):**
  1. *Before any change* — confirm discover-mode search (no itinerary open) surfaces
     Cortadito & Dos Lokos. Validates/falsifies the assumption that discover search
     already works; if it fails, that is a separate discover-mode bug to fold in.
  2. *After change* — itinerary-mode search surfaces them; VenuePreview
     "Add to Itinerary" adds to a list (verify a new row in `user_list_items`).

## Out of scope

- Backfilling happy-hour windows for Places-imported venues.
- Any web changes.
- The broader product question of whether the discover feed should surface
  window-less venues outside of search.

## Affected files

- `apps/mobile/src/components/AddToItinerarySheet.tsx` (new)
- `apps/mobile/src/screens/HappyHourDetailScreen.tsx` (refactor to use component)
- `apps/mobile/src/screens/VenuePreviewScreen.tsx` (add component)
- `apps/mobile/src/screens/MapScreen.tsx` (G1 search + merge + camera guard; extract pure helper)
- `test/*.test.mjs` (new logic + source-introspection tests)
