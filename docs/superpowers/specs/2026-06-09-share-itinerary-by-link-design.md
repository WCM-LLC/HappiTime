# Share Itinerary by Link (Phase 1 + 2) — Design

**Status:** Approved (token-possession access model). Phase 1 built now (OTA + Vercel);
Phase 2 native bits ride the Apple-nonce EAS build.
**Date:** 2026-06-09

## Problem
`FavoritesScreen.handleShareOutside` sends an SMS with **only** a store-download URL — no
itinerary link. Recipients tap → App Store → "Open" → app lands on its home screen; the
itinerary is never referenced. Confirmed greenfield: no public web viewer, no itinerary
deep-link handler. The existing `shared_itinerary_read_grant` (mig 20260605120000) covers
only the **in-app authenticated** friend-share, not an anonymous web link.

## Access model
**Possession of the unguessable `share_token` (uuid) is the grant** — the viewer works even
for `private` lists, since sharing externally is the explicit intent. Implemented via a
`SECURITY DEFINER` RPC so no broad anon RLS is opened.

## Data (migration)
`public.get_shared_itinerary(p_token uuid) returns jsonb` — `STABLE SECURITY DEFINER`,
`search_path=public`, `EXECUTE` to `anon, authenticated`. Returns `{ id, name, description,
author_handle, author_display_name, items: [{ venue_id, name, slug, address, neighborhood,
city, state, cuisine_type, price_tier, notes }] }` for the list whose `share_token` matches,
else no row (null). Bypasses RLS by design; the uuid token is the authorization.

Mobile generates + persists a `share_token` on first outside-share if null.

## Phase 1 — web viewer + share URL (OTA + Vercel, no build)
- `apps/directory/src/app/i/[token]/page.tsx` — server-fetches via the RPC (anon client),
  renders name/description/author/venues, OG + Twitter meta for a rich SMS/preview card,
  "Open in app" + "Download" CTAs. `notFound()` when the RPC returns null.
- `apps/mobile/.../FavoritesScreen.tsx#handleShareOutside` — ensure a `share_token`
  exists (generate + persist if null), then message:
  `Check out my "<name>" itinerary on HappiTime!\n\n<https://happitime.biz/i/<token>>\n\nDon't have the app? <storeUrl>`.

## Phase 2 — native open (rides the Apple-nonce build; needs Apple Team ID)
- `apps/mobile/app.json`: `ios.associatedDomains: ["applinks:happitime.biz"]`;
  Android `intentFilters` (autoVerify) for `https://happitime.biz/i/*`.
- `apps/directory` serves `/.well-known/apple-app-site-association`
  (appID `<TeamID>.com.jwill7486.happitime.mobile`, paths `["/i/*"]`) and
  `/.well-known/assetlinks.json` (Android package + SHA-256 cert fingerprint).
- Mobile deep-link handler: intercept `https://happitime.biz/i/<token>` and
  `happitime://itinerary?token=<token>`, fetch via the RPC, navigate to `ItineraryDetail`.

## Sequencing & verification
Phase 1 deploys independently (Vercel) + OTA. Phase 2 must be device-tested (tap a real
SMS link on an iPhone with the app installed → app opens to the itinerary) before App Store
release, alongside the Apple-nonce login test.

## Out of scope
- Editing a shared itinerary from the web (read-only viewer).
- In-app friend-share path (already works).
