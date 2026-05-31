# Venue "Download QR" button — design

**Date:** 2026-05-31
**Status:** Design approved; ready for implementation plan
**Scope:** One self-contained feature. Part of the QR attribution epic
(see `2026-05-31-qr-attribution-epic-overview.md`) but has no code
dependency on the other features.

## Problem

QR codes for venues exist only via an operator-run CLI
(`scripts/generate-venue-qrs.mjs`). A venue's own team has no way to get
the QR for their venue. This feature gives venue owners/managers a
self-service download from the venue admin page.

The scan-side flow is already built and verified: the QR encodes
`https://happitime.app/v/{slug}?src=qr`, which the directory's
`/v/[slug]` route handles (fires `track-visit`, deep-links to the app or
falls back to the web venue page). This feature only adds artifact
generation + download; it does not touch the scan flow.

## Decisions (locked)

- **Artifact:** bare branded QR PNG (no poster/PDF).
- **Generation:** on-demand server route (Approach A) — no storage,
  always fresh, single source of truth for the brand mark.
- **Sizes:** named print presets, capped at a 4" postcard. Physical
  size drives pixel count at 300 DPI; the QR is square.

  | Preset | Printed | Pixels @300 DPI | Use |
  |---|---|---|---|
  | `postcard` *(max)* | 4″ | 1200 | counter card / postcard |
  | `table_tent` | 3″ | 900 | tent cards |
  | `coaster` | 2.5″ | 750 | coasters |
  | `sticker` | 2″ | 600 | stickers / labels |
  | `digital` | — | 300 | website / email / screen |

- **Authorization:** reuse the venue page's existing check —
  `canManageVenue = isOwner || isManager || isAdminEmail` (roles
  `owner`/`manager`/`admin`/`editor`).
- **Unpublished venues:** warn-but-allow. The download works; the UI
  shows a muted note that the QR only becomes scannable once the venue
  is published (the `track-visit` lookup resolves published venues only —
  verified 404 path).

## Architecture

Three units:

### 1. `@happitime/venue-qr` — shared render module (new workspace package)

Plain ESM, zero side effects. The single source of truth for QR URL +
branded PNG rendering, imported by both the CLI script and the web route
so the brand mark can never drift.

```js
// Public interface
venueQrUrl(slug, base?) // → "{base}/v/{slug}?src=qr", base default https://happitime.biz
renderVenueQrPng(slug, { size, base }) // → Promise<Buffer> (PNG)
```

- Owns `qrcode` + `pngjs` as dependencies (today they are root
  devDependencies used only by the script).
- Move the existing `venueQrUrl`, `drawCenterMark`, and the per-size
  PNG-build loop out of `scripts/generate-venue-qrs.mjs` into this
  package. The script keeps its CLI parsing + DB slug-resolution and
  imports rendering from the package.
- `renderVenueQrPng` takes a pixel `size` (the preset→pixel mapping lives
  in the web layer / a shared constant; the render fn stays
  size-agnostic). Keep the existing render params: error-correction
  level `H`, margin 2, `dark #1A1A1A` / `light #FFFFFF`, center brand
  badge.

*Fallback if a workspace package is undesirable:* a `transpilePackages`
module. Workspace package is preferred — it is the friction-free import
path in this monorepo and matches `@happitime/shared-api`.

### 2. Route handler — `apps/web/src/app/api/orgs/[orgId]/venues/[venueId]/qr/route.ts`

- `export const runtime = 'nodejs'` (pngjs needs Node).
- `GET`, query `?size=<preset>`; validate against the preset set, default
  `postcard`. Unknown preset → 400.
- **Authorization** mirrors the venue page exactly:
  - Load the user via `createClient()`. No user → 401.
  - `isAdminEmail(user.email)` OR an `org_members` row for `(orgId,
    user.id)` with role in `{owner, manager, admin, editor}`. Otherwise →
    403.
- Confirm the venue exists and belongs to `orgId`; read its `slug` and
  `status`. Venue not found / wrong org → 404. No slug → 422.
- `renderVenueQrPng(slug, { size: presetPixels })` → return PNG with
  `Content-Type: image/png`,
  `Content-Disposition: attachment; filename="{slug}-qr-{preset}.png"`,
  `Cache-Control: private, max-age=0, must-revalidate`.
- Base URL from the same env the script uses (`QR_BASE_URL`, default
  `https://happitime.app`) so the button and printed sheets encode
  identical URLs.
- No internal error detail leaked in response bodies.

### 3. UI — venue admin page

In `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx`, inside a
`canManageVenue` block (near the media/branding section): a small "QR
code" subsection with

- a preset picker (dropdown or button group: Postcard / Table tent /
  Coaster / Sticker / Digital, with the printed inches as helper text),
- a **Download** action — a plain `<a download>` pointing at
  `/api/orgs/{orgId}/venues/{venueId}/qr?size={preset}`,
- a caption showing the encoded URL `happitime.app/v/{slug}?src=qr`,
- if `venue.status !== 'published'`, a muted note: "QR becomes scannable
  once the venue is published."

## Error handling

| Condition | Response |
|---|---|
| anon | 401 |
| authenticated non-member / insufficient role | 403 |
| venue not found or not in `orgId` | 404 |
| venue has no slug | 422 |
| invalid `size` preset | 400 |
| render failure | 500, no detail leaked |

## Testing

- **Unit (`@happitime/venue-qr`):**
  - `venueQrUrl` returns the expected URL (slug encoded; base override
    honored). Already covered for the script — move/keep the test.
  - `renderVenueQrPng` returns a valid PNG of the requested dimensions
    with finder patterns intact and the center knockout ~8.5% (mirror the
    script's existing checks).
- **Route:** authorization matrix (anon → 401, non-member → 403, manager
  → 200 + `image/png`), invalid preset → 400, unknown venue → 404.
- **Manual (verify skill):** click each preset in the running app,
  confirm the file downloads at the right pixel size and scans to
  `/v/{slug}?src=qr`.

## Out of scope (YAGNI)

Printable poster/PDF, storage/CDN caching, per-download custom `src`,
bulk/all-venue download, download analytics, sizes larger than a 4"
postcard.
