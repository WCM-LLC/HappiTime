# Web "Scan activity" Analytics Element — Design

**Date:** 2026-05-31
**Status:** Approved (design); pending implementation plan
**Epic:** QR attribution & check-in (`docs/superpowers/specs/2026-05-31-qr-attribution-epic-overview.md`)

## Goal

Surface a venue's scan/check-in activity to its **owners/managers/hosts** on the web
venue admin page — the surface they actually use. (The mobile venue-team push is
deployed but reaches no one yet: 0 venue owners have a registered push token. The web
is where operators are.) Answers "is my QR working / are people engaging?" at a glance.

## Decisions (user-approved)

- **Update mode:** on-load, server-rendered (refresh to update). Real-time is a fast-follow.
- **Relationship to the mobile push:** web is the primary surface; the mobile
  venue-team push stays deployed (costs nothing; works if an owner installs the app).
- **Content:** summary counts (by time window + by source) **plus** a short recent list.

## Background (verified)

- Data lives in `public.venue_attribution_events`: `venue_id`, `source` in
  `('qr','app_checkin','push_click','organic')`, `session_id`, `created_at`, indexed
  `(venue_id, created_at desc)`. Written by the `/v/[slug]` web bridge, the mobile
  deep-link flow, and the in-app check-in — all via the `track-visit` edge function.
- The venue admin page `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx` is an
  async server component. It already derives roles: `isOwner` (owner/admin),
  `isManager` (manager/admin/editor), `isHost` (host),
  `canManageVenue = isOwner || isManager || userIsAdmin`, and
  `canEditMenuItems = canManageVenue || isHost`. It imports `createServiceClient` and
  already uses a service client for admin reads. The venue object `v` has `timezone`.
- `venue_attribution_events` is RLS-locked (no direct anon/owner read policy today).

## Key decision: app-gated service read (no migration)

Owners have no RLS SELECT policy on `venue_attribution_events`. Rather than add an RLS
policy (a migration — risky given the open production migration-history drift), v1
reads with the **service-role client gated by the existing app-level role check**
(`canEditMenuItems`), mirroring the QR-download route's "authorize, then service read."
The data never reaches an unauthorized user because the page only renders the element
when `canEditMenuItems` is true (owner/manager/admin/editor/host) and only queries that
one venue's events. RLS hardening is a noted fast-follow.

**Zero migration drift (required):** this feature adds **no migration** — so it
contributes zero drift, consistent with the standing "0 drift at all times" rule. (The
separate pre-existing prod↔repo drift is tracked elsewhere and must be reconciled on its
own; it does not block this web-only feature.)

## Components (web only — no migration, no native change)

### 1. `summarizeScans(events, windows)` — pure, unit-tested
`apps/web/src/utils/scan-analytics.ts`

- Input: `events: { source: string; created_at: string }[]` (the venue's last-30d
  events) and `windows: { todayStart: string; weekStart: string; monthStart: string }`
  (ISO timestamps; precomputed by the caller using the venue timezone for `todayStart`,
  rolling for week/month).
- Output:
  ```ts
  type ScanSummary = {
    today: number;
    week: number;
    month: number;            // = total events passed in (already 30d-scoped)
    bySource: { qr: number; app_checkin: number; push_click: number; organic: number };
    recent: { source: string; created_at: string }[]; // newest first, max 8
  };
  ```
- Counts each window by comparing `created_at` to the boundary; tallies `bySource`
  across the 30d set; `recent` = the 8 newest (input may be unsorted — sort inside).
  Pure (no I/O, no `Date.now()` — boundaries are passed in), so it is fully testable.

### 2. Data fetch — in the venue page server component
After the existing auth/role derivation, when `canEditMenuItems`:
- Compute `monthStart = now - 30d`, `weekStart = now - 7d`, `todayStart = start of the
  current calendar day in `v.timezone`` (fall back to UTC day if timezone is missing).
- `createServiceClient().from("venue_attribution_events").select("source, created_at")
  .eq("venue_id", venueId).gte("created_at", monthStart).order("created_at", { ascending: false })`.
- `const scanSummary = summarizeScans(events ?? [], { todayStart, weekStart, monthStart })`.

### 3. `<VenueScanAnalytics summary={…} />` — presentational
`apps/web/src/components/VenueScanAnalytics.tsx`

- A "Scan activity" card matching the page's tokens (`rounded-lg border border-border
  bg-surface p-6 shadow-sm mb-8`, `text-heading-sm`, `text-muted`, brand accents).
- Time-window row: `Today {today} · 7 days {week} · 30 days {month}`.
- Per-source breakdown: `QR {qr} · Check-in {app_checkin} · Push {push_click} ·
  Organic {organic}` (label `app_checkin` as "Check-in").
- Recent list: up to 8 rows, `{relative time} · {source label}`.
- Empty state (month === 0): "No scans yet — print your QR code and place it in your
  venue." (links to the QR download section already on the page).

### 4. Wire into the page
Render `<VenueScanAnalytics summary={scanSummary} />` inside the `canEditMenuItems`
area of the venue page (e.g. near the QR code section). Visible to owner/manager/host
(plus admin/editor).

## Data flow
```
venue page load (owner/manager/host)
  → service-read venue_attribution_events (this venue, last 30d, source+created_at)
  → summarizeScans(events, windows)  [pure]
  → <VenueScanAnalytics summary>   (Today/7d/30d, by source, recent)
refresh to update.
```

## Error handling
- Query error → `events = []` → element renders the empty state (never throws the page).
- Missing `v.timezone` → `todayStart` falls back to the UTC day boundary.
- Unknown/extra source values → ignored by `bySource` (only the four known keys), but
  still counted in window totals and shown in `recent` with the raw label.

## Testing
- **Unit (node:test):** `summarizeScans` — events split correctly at each window
  boundary (inclusive `>=`), per-source tallies (incl. an unknown source ignored in
  `bySource`), `recent` newest-first and capped at 8, empty input → all zeros + empty
  recent.
- **Build/typecheck:** web `tsc --noEmit` + `next build` compile the new component +
  page wiring.
- **Manual:** load a venue page as owner/manager/host; confirm the card renders with
  correct counts (cross-check against a direct `venue_attribution_events` query); a
  venue with no events shows the empty state.

## Out of scope (fast-follows)
- Real-time live updates (Supabase Realtime + an owner-scoped RLS SELECT policy).
- A dedicated RLS policy (v1 uses the app-gated service read).
- Charts/trends, per-source time series, org-level rollup across venues.

## Deploy
Web only → ships via Vercel on merge to master. No edge-function deploy, no migration,
no mobile/native change.
