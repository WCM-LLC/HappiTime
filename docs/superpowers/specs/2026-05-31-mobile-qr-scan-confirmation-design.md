# In-App QR Scan Confirmation — Design

**Date:** 2026-05-31
**Status:** Approved (design); pending implementation plan
**Related:** PR #32/#33 (web QR download + `/v/[slug]` "Scan recorded" banner), `TODO.md` "Mobile deep-link routing" item.

## Goal

When a user scans a venue QR and the HappiTime app opens, route them to the venue
screen and show a visible "Checked in!" confirmation — closing the gap where an
app-installed scanner currently lands in the app with no sign the scan worked.

## Background / current state

- The QR encodes `https://happitime.biz/v/{slug}?src=qr`. Scanning opens the web
  bridge (`apps/directory/.../v/[slug]`), which records the visit via the
  `track-visit` edge function, shows "✓ Scan recorded", then opens the native app
  via the custom scheme **`happitime://venue/{slug}`** (held until the result shows
  — PR #33).
- The app's scheme is `happitime` (`app.json`), so it already opens from that link
  (confirmed in the field). It just doesn't route the URL yet.
- Deep links are handled by **manual `expo-linking` listeners** (see
  `src/hooks/useMagicLinkListener.ts` for the auth flow), NOT React Navigation's
  `linking` config. Programmatic navigation from an external trigger is already done
  in `src/hooks/useNotificationNavigation.ts` via a `navigationRef`.
- The real navigator is **`src/navigation/AppNavigator.tsx`** (mounted by `App.tsx`).
  It holds `navigationRef`, mounts `useNotificationNavigation(navigationRef)`, and
  registers `VenuePreview` as a top-level (not auth-gated) stack screen taking
  `{ venueId }`. (`src/navigation/index.tsx` is dead code — ignore it; the `TODO.md`
  reference to it is stale.)
- `VenuePreviewScreen` already has an "I'm here" check-in (`track-visit`,
  `source: "app_checkin"`).

## Key decision: display-only confirmation (no second attribution)

The web bridge **already** fires `track-visit` (`source=qr`) before opening the app.
The app must **not** re-fire it: web uses a `localStorage` session id and the app a
separate `AsyncStorage` id, so the server can't dedupe across them → the same scan
would be counted twice. Therefore the in-app piece is a **purely visual**
confirmation. (User-approved.)

## Components (all JS/TS — no native change, no new dependencies)

### 1. `src/hooks/useVenueDeepLink.ts`
Mirrors `useMagicLinkListener` / `useNotificationNavigation`.

- **Pure, unit-testable parser** `parseVenueLink(url): { slug: string; src: string | null } | null`:
  - Matches `happitime://venue/{slug}` (primary; what the bridge emits) and tolerates
    `https://happitime.biz/v/{slug}` should it ever reach the app.
  - Extracts the trailing path segment as `slug` (URL-decoded) and the `src` query param.
  - Returns `null` for any non-venue URL (e.g. `happitime://auth/...`) so this hook
    never interferes with the auth listener.
- **Listener:** on cold start `Linking.getInitialURL()` and warm
  `Linking.addEventListener("url", …)`. Guards against double-handling (ref) and
  React StrictMode.
- **Resolve slug → venueId:** `supabase.from("venues").select("id").eq("slug", slug).maybeSingle()`
  (venues are already read by id on mobile and by slug on web; RLS permits select).
- **Navigate:** on success, `navigationRef.navigate("VenuePreview", { venueId, fromScan: src === "qr" })`.
- **Failure handling:** unknown slug / query error / missing nav ref → no-op. Never
  throws; never blocks the app open. Log (non-fatal) for diagnostics.

### 2. Mount point — `src/navigation/AppNavigator.tsx`
Add `useVenueDeepLink(navigationRef)` next to `useNotificationNavigation(navigationRef)`.

### 3. Param type — `src/navigation/types.ts`
`VenuePreview?: { venueId: string; fromScan?: boolean }`.

### 4. `src/screens/VenuePreviewScreen.tsx` — confirmation banner
- When `route.params.fromScan` is true, render an auto-fading "✓ Checked in!" banner
  at the top of the screen (`Animated` opacity, visible ~3s then fade). Brand colors
  (`#C8965A` / success green, matching the web banner's intent).
- **Display-only** — no `track-visit` call.
- After showing once, clear the param (`navigation.setParams({ fromScan: false })`) so
  back-navigation / re-render doesn't replay the banner.

## Data flow

```
QR (happitime.biz/v/{slug}?src=qr)
  → web bridge: track-visit(source=qr) + "✓ Scan recorded"  [already shipped]
  → opens happitime://venue/{slug}?src=qr
  → useVenueDeepLink: parseVenueLink → slug,src
  → resolve slug → venueId (Supabase)
  → navigate VenuePreview { venueId, fromScan:true }
  → VenuePreviewScreen: show "✓ Checked in!" banner (no attribution call)
```

## Error handling

- Non-venue or malformed URL → parser returns `null` → ignored.
- Unknown slug / DB error → no navigation, app opens to its default screen (no crash,
  no banner). Logged.
- nav ref not ready at cold start → resolve runs after navigation mounts (mirror the
  notification hook's readiness handling).

## Testing

- **Unit (node:test):** `parseVenueLink` — `happitime://venue/sea-capitan?src=qr` →
  `{slug:"sea-capitan", src:"qr"}`; `https://happitime.biz/v/sea-capitan?src=qr` parses
  the same; URL-encoded slug decodes; `happitime://auth/callback` → `null`; missing
  slug → `null`; no `src` → `src:null`.
- **Device-verified (no RN test harness in repo):** cold-start and warm deep link route
  to the right venue and show the banner once; unknown slug is a safe no-op.

## Out of scope (follow-ups)

- True **universal links** (`https://happitime.biz/v/...` opening the app directly,
  bypassing Safari) — needs an Apple App Site Association file + `associated domains`
  entitlement + a store build. Current scheme-based flow does not require it.
- Unifying the web and app attribution **session ids** (would let the app safely
  re-fire `track-visit` without double-counting).

## Deploy

Pure JS/TS; no native module added (`expo-linking` and the `happitime` scheme already
ship). So it is **OTA-eligible** via `eas update --channel production`, **provided** the
live store build's `runtimeVersion` matches `1.0.3` (policy `appVersion`). Confirm the
runtime match against the production build before publishing; otherwise it needs a new
store build, not an OTA.

## Update — on-device verification (2026-05-31)

Verified on the iOS simulator (iPhone 17 Pro, dev build + Metro). Two fixes the
simulator surfaced that the unit tests / typecheck could not:

1. **Auth-gate drop (critical).** `useVenueDeepLink` mounted inside `AppNavigator`
   never ran for an unauthenticated user, because `App.tsx` shows a Welcome /
   AuthScreen gate with `AppNavigator` UNMOUNTED until the user signs in or picks
   guest mode. Since QR codes target new users, the primary flow was broken.
   **Fix:** capture the link above the gate (`useVenueLinkCapture`, mounted at the
   App root like `useMagicLinkListener`), stash it (`lib/pendingVenueLink`), and
   auto-enter guest mode so the navigator mounts; `useVenueDeepLink` then consumes
   the stash and routes. New files: `src/hooks/useVenueLinkCapture.ts`,
   `src/lib/pendingVenueLink.ts`. Verified: a cold-start `happitime://venue/sea-capitan?src=qr`
   now opens the Sea Capitán screen instead of the sign-in wall.
2. **`URLSearchParams` portability.** RN lacks a reliable `URLSearchParams.get`;
   the parser now extracts `src` with a manual regex.
3. **Banner centering.** `alignSelf:center` doesn't center an absolutely-positioned
   view; wrapped in a full-width `alignItems:center` container. The "✓ Checked in!"
   pill renders on QR arrival (display-only, no second `track-visit`).
