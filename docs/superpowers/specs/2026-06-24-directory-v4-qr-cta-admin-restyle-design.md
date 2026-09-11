# Directory v4 — QR App-Download CTA + Admin Console Restyle

**Date:** 2026-06-24
**Source design:** Claude Design "Happitime app store links" → `HappiTime Directory.html` (Directory v4 mockup)

## Context

The mockup is a self-contained static React-18-UMD prototype of HappiTime's public
directory (home, `/kc` list+map, venue detail) plus an Admin Console. A file-by-file
audit of `apps/directory` and `apps/web` found the **public surfaces are already built
to this design** (split list/map, filter chips, Open Now, share-link, mobile tabs, the
"iTi" app banner, breadcrumb, today-highlighted windows, final app CTA) and in places
exceed it (events, photos, location map, claim CTA, social links).

So "implement the design" reduces to the genuine deltas:

- **Piece B — QR app-download CTA** (the one net-new public element). Now that the
  **Android app is live**, wire scannable QR codes for **both** iOS and Android.
- **Piece A — Admin Console restyle** (`apps/web`): the existing admin already has
  search / dropdown filters / pagination / publish toggles, so this is visual polish
  bound to real columns — not new behavior.

The mockup's hero Home page is intentionally **out of scope** (decided with user): `/`
redirects to `/kc/` and that stays.

## Canonical store links (single source of truth)

- iOS: `https://apps.apple.com/us/app/happitime/id6757933269`
- Android: `https://play.google.com/store/apps/details?id=com.jwill7486.happitime.mobile`

The Android package was confirmed by the user against the live Play Store listing. It
matches the mobile build config (`package`/`bundleIdentifier`) and
`apps/directory/public/.well-known/assetlinks.json`. The mockup's `biz.happitime.app`
and `apps/mobile/src/lib/storeLinks.ts`'s `com.happitime` are both stale/placeholder.

## Piece B — QR app-download CTA

### New: `apps/directory/src/lib/storeLinks.ts`
Exports `APP_STORE_URL`, `PLAY_STORE_URL`, and a `qrSrc(data, size)` helper
(`api.qrserver.com`, `color=1A1A1A`, `bgcolor=FFFFFF`, `format=svg`). One source of
truth for the directory app.

### New: `apps/directory/src/components/StoreDownloadCTA.tsx` (client)
Ports the mockup's `StoreQR` + `DownloadCTA`:
- Two cards (iPhone, Android), each a white rounded card holding a scannable SVG QR that
  is itself a tappable `<a>` to the store, with a store button beneath.
- Caption: "Scan with your phone camera, or tap to install."
- `align` prop (`center` | `start`) to match the mockup's two layouts.

### Wiring
- **`/app` page** (`apps/directory/src/app/app/page.tsx`): replace the stale "Android
  coming soon / Notify Me" block with the live dual-store QR CTA. Keep the phone mockup.
  Update page copy/metadata that says Android is coming.
- **Venue detail** (`apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx`): replace
  the single "Open in App" button in the final CTA `<section>` with `<StoreDownloadCTA/>`.
  (Server component renders the client component — fine.)
- **`AppDownloadStrip`** (footer): point Google Play at the real `PLAY_STORE_URL` instead
  of `/app/`, and use the shared link constants.

### Also fix
- `apps/mobile/src/lib/storeLinks.ts`: `com.happitime` → `com.jwill7486.happitime.mobile`.

## Piece A — Admin Console restyle (`apps/web/src/app/admin`)

Bind to **real** columns only — the mockup's org-level plan tier / owner / manager /
per-org publish toggle do not exist on `OrgRow` (id, name, slug, created_at,
venue_count, member_count); tiering lives on venues (`promotion_tier`).

- Add a **stat-card row** at the top of the admin page: Total Organizations, Total
  Venues, Total Users, Neighborhoods (or Active) — real counts.
- Wrap each table (`OrgsTable`, `VenuesTable`, plus existing `WindowsTable`,
  `UsersTable`) in the mockup's rounded card container w/ header + record count.
- Preserve all existing columns, server actions (`adminToggleVenueStatus`,
  `adminUpdateOrganization`, …), search, filters, and pagination.

## Sequencing
1. Piece B (QR CTA) — user priority, fully unblocked.
2. Piece A (admin restyle).

## Verification
- `tsc --noEmit` / lint for `apps/directory` and `apps/web`.
- Manual: QR codes render and resolve to the correct store listings on a device.
- CI green (Node 20) before considering done.

## Out of scope
- Hero Home page activation.
- `/kc` + venue-detail micro visual tweaks (shipped pages already match).
- Admin data-model changes to add mockup-only org fields.
