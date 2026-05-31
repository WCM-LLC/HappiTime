# Venue QR Download Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a venue's owner/manager download a branded QR PNG (sized for print, capped at a 4″ postcard) from the venue admin page.

**Architecture:** Extract the existing QR-render logic out of `scripts/generate-venue-qrs.mjs` into a new zero-side-effect workspace package `@happitime/venue-qr` (single source of truth for the brand mark). A `runtime='nodejs'` route handler in the web app authorizes the caller, resolves the venue slug, renders the PNG in-memory, and streams it as a download. The venue page gets a small download subsection.

**Tech Stack:** npm workspaces, Node `node:test`, Next.js 15 App Router (server components + route handlers), `qrcode` + `pngjs`, Supabase server clients.

**Spec:** `docs/superpowers/specs/2026-05-31-venue-qr-download-button-design.md`

---

## File Structure

- **Create** `packages/venue-qr/package.json` — new workspace package manifest.
- **Create** `packages/venue-qr/index.mjs` — `venueQrUrl`, `SIZE_PRESETS`, `renderVenueQrPng` (+ private `drawCenterMark`). The only place the brand mark is drawn.
- **Create** `test/venue-qr.test.mjs` — unit tests for the package.
- **Modify** `scripts/generate-venue-qrs.mjs` — consume the package; drop the moved logic; re-export `venueQrUrl` for back-compat.
- **Create** `apps/web/src/app/api/orgs/[orgId]/venues/[venueId]/qr/route.ts` — download route handler.
- **Modify** `apps/web/package.json` — add `@happitime/venue-qr` dependency.
- **Modify** `apps/web/next.config.mjs` — add the package to `transpilePackages`.
- **Modify** `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx` — slug fetch + QR download subsection.

---

## Task 1: Create the `@happitime/venue-qr` package

**Files:**
- Create: `packages/venue-qr/package.json`
- Create: `packages/venue-qr/index.mjs`
- Test: `test/venue-qr.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/venue-qr.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { venueQrUrl, renderVenueQrPng, SIZE_PRESETS } from "@happitime/venue-qr";

test("venueQrUrl encodes slug and appends src=qr", () => {
  assert.equal(
    venueQrUrl("sea-capitan", "https://happitime.biz"),
    "https://happitime.biz/v/sea-capitan?src=qr",
  );
});

test("venueQrUrl strips a trailing slash from base and url-encodes the slug", () => {
  assert.equal(venueQrUrl("a b", "https://x.dev/"), "https://x.dev/v/a%20b?src=qr");
});

test("renderVenueQrPng returns a PNG buffer of the requested pixel size", async () => {
  const buf = await renderVenueQrPng("sea-capitan", { size: 300 });
  const png = PNG.sync.read(buf); // throws if not a valid PNG
  assert.equal(png.width, 300);
  assert.equal(png.height, 300);
});

test("every SIZE_PRESET is no larger than a 4-inch postcard (1200px)", () => {
  const keys = Object.keys(SIZE_PRESETS);
  assert.ok(keys.includes("postcard") && keys.includes("digital"));
  for (const preset of Object.values(SIZE_PRESETS)) {
    assert.ok(preset.px <= 1200, `${preset.label} exceeds postcard cap`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/venue-qr.test.mjs`
Expected: FAIL — cannot find package `@happitime/venue-qr` (module not resolved).

- [ ] **Step 3: Create the package manifest**

Create `packages/venue-qr/package.json` (align `pngjs`/`qrcode` versions with the root `package.json` lockfile — root already has `qrcode`):

```json
{
  "name": "@happitime/venue-qr",
  "version": "0.0.1",
  "type": "module",
  "main": "index.mjs",
  "exports": {
    ".": "./index.mjs"
  },
  "dependencies": {
    "qrcode": "^1.5.4",
    "pngjs": "^7.0.0"
  }
}
```

- [ ] **Step 4: Create the package module**

Create `packages/venue-qr/index.mjs` (the `setPixel`/`fillRect`/`drawCenterMark` bodies are moved verbatim from `scripts/generate-venue-qrs.mjs`):

```js
// packages/venue-qr/index.mjs
//
// Single source of truth for venue QR codes: the public landing URL and the
// branded PNG (error-correction level H + a centered HappiTime "H" badge).
// Imported by both scripts/generate-venue-qrs.mjs (CLI) and the web download
// route, so the brand mark can never drift. Zero side effects — safe to import
// from a Next.js route handler.

import QRCode from "qrcode";
import { PNG } from "pngjs";

const DEFAULT_BASE = (process.env.QR_BASE_URL || "https://happitime.biz").replace(/\/+$/, "");
const BRAND = { r: 0xc8, g: 0x96, b: 0x5a };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

// Print-size presets, capped at a 4" postcard. px = inches * 300 DPI (QR is square).
export const SIZE_PRESETS = {
  postcard: { px: 1200, inches: 4, label: "Postcard" },
  table_tent: { px: 900, inches: 3, label: "Table tent" },
  coaster: { px: 750, inches: 2.5, label: "Coaster" },
  sticker: { px: 600, inches: 2, label: "Sticker" },
  digital: { px: 300, inches: null, label: "Digital" },
};

/** The public landing URL encoded into the QR for a venue slug. */
export function venueQrUrl(slug, base = DEFAULT_BASE) {
  return `${base.replace(/\/+$/, "")}/v/${encodeURIComponent(slug)}?src=qr`;
}

function setPixel(png, x, y, c) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = c.r;
  png.data[idx + 1] = c.g;
  png.data[idx + 2] = c.b;
  png.data[idx + 3] = 255;
}

function fillRect(png, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) setPixel(png, x, y, c);
  }
}

/** Centered HappiTime mark: white knockout, brand badge, white "H" glyph. */
function drawCenterMark(png) {
  const size = png.width;
  const badge = Math.round(size * 0.22);
  const pad = Math.round(badge * 0.16);
  const cx = Math.round((size - badge) / 2);
  const cy = Math.round((size - badge) / 2);

  fillRect(png, cx - pad, cy - pad, badge + pad * 2, badge + pad * 2, WHITE);
  fillRect(png, cx, cy, badge, badge, BRAND);

  const inset = Math.round(badge * 0.26);
  const barW = Math.round(badge * 0.14);
  const innerX = cx + inset;
  const innerY = cy + inset;
  const innerW = badge - inset * 2;
  const innerH = badge - inset * 2;
  fillRect(png, innerX, innerY, barW, innerH, WHITE);
  fillRect(png, innerX + innerW - barW, innerY, barW, innerH, WHITE);
  fillRect(png, innerX, innerY + Math.round((innerH - barW) / 2), innerW, barW, WHITE);
}

/** Render a branded venue QR PNG at `size` pixels square. Returns a Buffer. */
export async function renderVenueQrPng(slug, { size = 1200, base = DEFAULT_BASE } = {}) {
  const buf = await QRCode.toBuffer(venueQrUrl(slug, base), {
    type: "png",
    errorCorrectionLevel: "H",
    width: size,
    margin: 2,
    color: { dark: "#1A1A1Aff", light: "#FFFFFFff" },
  });
  const png = PNG.sync.read(buf);
  drawCenterMark(png);
  return PNG.sync.write(png);
}
```

- [ ] **Step 5: Link the workspace package**

Run: `npm install`
Expected: completes; `node_modules/@happitime/venue-qr` is symlinked to `packages/venue-qr`.

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/venue-qr.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/venue-qr/package.json packages/venue-qr/index.mjs test/venue-qr.test.mjs package-lock.json
git commit -m "feat(venue-qr): extract branded QR render into @happitime/venue-qr package"
```

---

## Task 2: Point the CLI script (and existing test) at the package

**Files:**
- Modify: `scripts/generate-venue-qrs.mjs`

The script keeps its CLI arg parsing, DB slug resolution, and file output. It no longer owns rendering. The existing `test/track-visit.test.mjs` imports `venueQrUrl` from this script, so we **re-export** it to avoid touching that test.

- [ ] **Step 1: Replace the render imports and helpers**

In `scripts/generate-venue-qrs.mjs`:

Replace the `qrcode` + `pngjs` imports near the top:

```js
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
```

with:

```js
import { venueQrUrl, renderVenueQrPng } from '@happitime/venue-qr';

// Re-exported so existing tests (test/track-visit.test.mjs) keep importing it here.
export { venueQrUrl };
```

Then **delete** these now-moved declarations from the script: the `BRAND` and `WHITE` consts, `setPixel`, `fillRect`, `drawCenterMark`, and the local `export function venueQrUrl(...)`. Keep `BASE_URL`, `OUT_DIR`, and `SIZES = [1200, 300]`.

- [ ] **Step 2: Use `renderVenueQrPng` in `generateForSlug`**

Replace the body of `generateForSlug` with:

```js
async function generateForSlug(slug) {
  const url = venueQrUrl(slug);
  const outputs = [];
  for (const size of SIZES) {
    const buf = await renderVenueQrPng(slug, { size });
    const outPath = path.join(OUT_DIR, `${slug}-${size}.png`);
    await writeFile(outPath, buf);
    outputs.push(outPath);
  }
  return { slug, url, outputs };
}
```

- [ ] **Step 3: Run the full suite to verify nothing regressed**

Run: `npm test`
Expected: PASS — the existing `test/track-visit.test.mjs` `venueQrUrl` coverage still passes via the re-export, and `test/venue-qr.test.mjs` passes.

- [ ] **Step 4: Smoke-test the script still generates a PNG**

Run: `node scripts/generate-venue-qrs.mjs --slugs sea-capitan --no-db`
Expected: prints `✓ sea-capitan https://happitime.biz/v/sea-capitan?src=qr` and writes `outputs/qr/sea-capitan-1200.png` + `sea-capitan-300.png`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-venue-qrs.mjs
git commit -m "refactor(venue-qr): script consumes @happitime/venue-qr render module"
```

---

## Task 3: Add the download route handler

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.mjs`
- Create: `apps/web/src/app/api/orgs/[orgId]/venues/[venueId]/qr/route.ts`

- [ ] **Step 1: Add the package as a web dependency**

In `apps/web/package.json`, add to `"dependencies"`:

```json
"@happitime/venue-qr": "*",
```

- [ ] **Step 2: Transpile the workspace package in Next**

In `apps/web/next.config.mjs`, extend the existing `transpilePackages` array:

```js
transpilePackages: ['@uiw/react-md-editor', '@uiw/react-markdown-preview', '@happitime/venue-qr'],
```

- [ ] **Step 3: Install**

Run: `npm install`
Expected: completes; `@happitime/venue-qr` resolves inside `apps/web`.

- [ ] **Step 4: Write the route handler**

Create `apps/web/src/app/api/orgs/[orgId]/venues/[venueId]/qr/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import { SIZE_PRESETS, renderVenueQrPng } from '@happitime/venue-qr';

// pngjs needs Node APIs — must run on the Node.js runtime, not edge.
export const runtime = 'nodejs';

// Mirrors the venue page's canManageVenue check (owner/manager/admin/editor + platform admin).
const MANAGE_ROLES = new Set(['manager', 'admin', 'editor']);

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ orgId: string; venueId: string }> },
) {
  const { orgId, venueId } = await ctx.params;
  const preset = new URL(_req.url).searchParams.get('size') ?? 'postcard';

  if (!Object.prototype.hasOwnProperty.call(SIZE_PRESETS, preset)) {
    return NextResponse.json({ error: 'Invalid size preset' }, { status: 400 });
  }

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userIsAdmin = await isAdminEmail(user.email);
  const { data: membership } = await authClient
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = String(membership?.role ?? '');
  const canManage = userIsAdmin || role === 'owner' || MANAGE_ROLES.has(role);
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Admins read via service role (cross-org). Resolve slug directly — fetchVenueById
  // does not select `slug`. Scoping by org_id makes an out-of-org venue a clean 404.
  const db = userIsAdmin ? createServiceClient() : authClient;
  const { data: venue, error } = await db
    .from('venues')
    .select('slug, status')
    .eq('id', venueId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Venue lookup failed' }, { status: 500 });
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
  if (!venue.slug) return NextResponse.json({ error: 'Venue has no slug' }, { status: 422 });

  const png = await renderVenueQrPng(venue.slug, {
    size: SIZE_PRESETS[preset as keyof typeof SIZE_PRESETS].px,
  });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${venue.slug}-qr-${preset}.png"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
```

- [ ] **Step 5: Type-check the web app**

Run: `npm run -w web build` (or the repo's web typecheck script if present)
Expected: compiles without type errors in the new route file.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/next.config.mjs apps/web/src/app/api/orgs/[orgId]/venues/[venueId]/qr/route.ts package-lock.json
git commit -m "feat(venue-qr): nodejs route to download a venue QR PNG by preset"
```

---

## Task 4: Add the QR download subsection to the venue page

**Files:**
- Modify: `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx`

The page already has `orgId`, `venueId`, the venue object `v` (`const v = venue;` ~line 405, with `v.status`), and the `canManageVenue` boolean (~line 278). `fetchVenueById` does **not** return `slug`, so fetch it once for the caption.

- [ ] **Step 1: Import `SIZE_PRESETS`**

Add to the imports at the top of the file:

```ts
import { SIZE_PRESETS } from '@happitime/venue-qr';
```

- [ ] **Step 2: Fetch the slug for the caption**

Right after the `fetchVenueById` call (the line `const { data: venue, error: venueErr } = await fetchVenueById(...)`, ~line 281), add:

```ts
const { data: qrVenue } = await supabase
  .from('venues')
  .select('slug')
  .eq('id', venueId)
  .maybeSingle();
const qrSlug = (qrVenue?.slug as string | null) ?? null;
```

- [ ] **Step 3: Render the download subsection**

Inside the `canManageVenue` branding/media area, add this block (uses plain `<a download>` links — no client component needed). Match the surrounding Tailwind class style; the classes below are a reasonable default:

```tsx
{canManageVenue && qrSlug && (
  <section className="mt-6 rounded-lg border border-gray-200 p-4">
    <h3 className="text-sm font-semibold text-gray-900">QR code</h3>
    <p className="mt-1 text-sm text-gray-500">
      Scannable code for your venue. Download, print, and place it in your building.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      {Object.entries(SIZE_PRESETS).map(([key, preset]) => (
        <a
          key={key}
          href={`/api/orgs/${orgId}/venues/${venueId}/qr?size=${key}`}
          download
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {preset.label}
          {preset.inches ? ` (${preset.inches}")` : ''}
        </a>
      ))}
    </div>
    <p className="mt-2 text-xs text-gray-400">
      Links to happitime.biz/v/{qrSlug}?src=qr
    </p>
    {v?.status !== 'published' && (
      <p className="mt-1 text-xs text-amber-600">
        QR becomes scannable once the venue is published.
      </p>
    )}
  </section>
)}
```

- [ ] **Step 4: Type-check / build the web app**

Run: `npm run -w web build`
Expected: compiles; the new JSX and import type-check.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx
git commit -m "feat(venue-qr): QR download subsection on the venue admin page"
```

---

## Task 5: Manual end-to-end verification (verify skill)

**Files:** none (runtime observation).

- [ ] **Step 1: Start the web dev server**

Run the web app dev server (the repo's web dev command, e.g. `npm run -w web dev`). Note the local URL/port.

- [ ] **Step 2: Sign in as an owner/manager and open a venue**

Navigate to `/orgs/{orgId}/venues/{venueId}` for a venue you manage. Confirm the "QR code" subsection renders with five preset buttons and the caption URL.

- [ ] **Step 3: Download each preset and check pixel size**

Click each button. For each downloaded file confirm the dimensions match the preset (Postcard 1200², Table tent 900², Coaster 750², Sticker 600², Digital 300²) — e.g. `sips -g pixelWidth -g pixelHeight ~/Downloads/{slug}-qr-postcard.png` on macOS.

- [ ] **Step 4: Confirm the QR scans to the right URL**

Scan one downloaded PNG with a phone. Expected: resolves to `https://happitime.biz/v/{slug}?src=qr` (or the `QR_BASE_URL` you have configured).

- [ ] **Step 5: Probe authorization**

While signed out (or as a non-member), request `/api/orgs/{orgId}/venues/{venueId}/qr?size=postcard` directly. Expected: 401 (anon) / 403 (non-member). Request `?size=billboard`. Expected: 400. Request a venueId from another org. Expected: 404.

- [ ] **Step 6: Record the verification result** (PASS/FAIL with captured evidence).

### Verification Record (2026-05-31)

**Build / bundling (the plan's flagged risk):** `npm run -w web build` → **PASS**, exit 0. The
route `/api/orgs/[orgId]/venues/[venueId]/qr` compiled as a dynamic function with no
`qrcode`/`pngjs` bundling error. `transpilePackages: ['@happitime/venue-qr']` was sufficient —
the `serverExternalPackages` fallback in Self-Review notes was **not** needed.

**Unit tests:** `npm test` → **PASS** (111 pass, 0 fail). Includes the 4 new `test/venue-qr.test.mjs`
cases (`venueQrUrl` encoding, `renderVenueQrPng` 300px PNG, postcard-cap assertion).

**Type-check:** `npm run -w web typecheck` (tsc --noEmit) → **PASS**. Required adding hand-written
`packages/venue-qr/index.d.ts` (+ a `types` export condition) — the package ships plain ESM and
the web app's strict TS rejected the implicit `any`. (Deviation from plan, necessary.)

**Auth probes (autonomous, dev server :3007):**
- Unauthenticated `?size=postcard` → **401** `{"error":"Unauthorized"}` ✓
- `?size=billboard` (invalid preset) → **400** ✓ (preset validated before auth)

**Still needs the user (real credentials / device required — NOT verified here):**
- Sign in as owner/manager, open the venue page, confirm the "QR code" subsection + 5 buttons + caption.
- Download each preset; confirm pixel dims (1200/900/750/600/300²) via `sips -g pixelWidth ...`.
- Scan a PNG with a phone → resolves to `https://happitime.biz/v/{slug}?src=qr`.
- 403 (signed-in non-member) and 404 (venueId from another org) — need a real member/non-member.

**Overall:** implementation + build + unit tests + unauthenticated auth gating **PASS**; the
authenticated/device-dependent click-through is handed to the user.

---

## Self-Review notes

- **Spec coverage:** package extraction (Task 1–2), nodejs route w/ presets + auth + 401/403/404/422/400 (Task 3), UI subsection + unpublished note + caption (Task 4), unit tests for `venueQrUrl`/`renderVenueQrPng`/preset cap (Task 1), manual e2e + auth probes (Task 5). All spec sections mapped.
- **Type consistency:** `SIZE_PRESETS[preset].px`, `renderVenueQrPng(slug, { size })`, `venueQrUrl(slug, base)` consistent across package, route, UI, and script.
- **Known follow-up:** if `qrcode`/`pngjs` fail to bundle in the Node route at build time, move them from `transpilePackages` handling into `serverExternalPackages` in `next.config.mjs` (they are CommonJS Node libs).
```
