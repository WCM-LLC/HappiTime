# Venue-team Scan Push — Design

**Date:** 2026-05-31
**Status:** Approved (design); pending implementation plan
**Epic:** QR attribution & check-in — sub-project 2 (`docs/superpowers/specs/2026-05-31-qr-attribution-epic-overview.md`)

## Goal

When a customer's visit is **recorded** as an attribution event, notify the venue's
**owners and managers** in real time ("New visit at {venue}"). This closes the
attribution loop for the paying side: venue owners see HappiTime driving real
interest the moment it happens. Tapping the push opens the venue screen.

## Decisions (user-approved)

- **Wiring:** inline in `track-visit` via `EdgeRuntime.waitUntil` after the successful
  insert — no separate edge function, no internal HTTP hop. The push runs in the
  background and never affects the `track-visit` response.
- **Trigger sources:** **all four** recorded sources (`qr`, `app_checkin`,
  `push_click`, `organic`). The message wording is source-aware so it reads naturally.
- **Recipients:** `org_members` with role `owner` or `manager` for the venue's org.
- **Prefs:** default **on**; add a `notifications_venue_scans` column to
  `user_preferences` and respect it (a missing row counts as on). The Profile UI
  toggle is a fast-follow.

## Background (verified)

- `track-visit` (`supabase/functions/track-visit/index.ts`) resolves a published
  venue (by id or slug), runs `check_rate_limit` (1 event per (venue, source,
  session) per 4h), and on a non-deduped hit inserts into
  `venue_attribution_events`, then returns `{ ok: true }`. The **deduped path returns
  early** (`{ ok: true, deduped: true }`) — so hooking *after* the insert naturally
  fires only on recorded events. It uses a **service-role** client (bypasses RLS).
- Recipient schema: `venues.org_id` → `org_members(org_id, user_id, role)` (role in
  `owner|manager|host|admin|editor|viewer`) → `user_push_tokens(user_id,
  expo_push_token)` (a user may have multiple tokens).
- `user_preferences` already has `notifications_happy_hours`,
  `notifications_venue_updates`, `notifications_friend_activity` (all default true) —
  none applies to venue-team scans, hence the new column.
- Expo sender exists in `notify-upcoming-happy-hours` (batched POST to
  `https://exp.host/--/api/v2/push/send`, `BATCH_SIZE=100`). No `_shared/` dir yet.
- **Mobile tap is already wired:** `useNotificationNavigation` handles
  `data.type === "venue"` + `data.venueId` → `navigate("VenuePreview", { venueId })`.
  No mobile change is required.

## Components (backend only)

### 1. Migration — `supabase/migrations/<ts>_add_venue_scan_notification_pref.sql`
```sql
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS notifications_venue_scans boolean NOT NULL DEFAULT true;
```

### 2. `supabase/functions/_shared/expo-push.ts` (Deno)
Extract the existing sender into one reusable unit:
- `type ExpoPushMessage = { to: string; title: string; body: string; data?: Record<string, unknown> }`
- `async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void>` — chunks by
  100, POSTs each batch to `EXPO_PUSH_URL`, logs and swallows errors (never throws to
  the caller). No-op on empty input.
- Refactor `notify-upcoming-happy-hours` to import this (one sender, not two).

### 3. `supabase/functions/_shared/scan-message.mjs` (pure, no Deno/Node-specific APIs)
- `buildVenueScanMessage(source, venueName) → { title, body }`, source-aware:
  - `qr` → "New QR scan" / "Someone just scanned your QR code at {venue}."
  - `app_checkin` → "New check-in" / "Someone just checked in at {venue}."
  - `push_click` / `organic` / fallback → "New visit" / "Someone just visited {venue} on HappiTime."
- `.mjs` so the Deno function and CI's **Node 20** test both import it (no type-stripping;
  cf. the `parseVenueLink.mjs` lesson).

### 4. `track-visit/index.ts` changes
- Venue select: `select("id")` → `select("id, org_id, name")`.
- After the successful insert (recorded path only), before `return json({ ok: true })`:
  ```ts
  EdgeRuntime.waitUntil(
    notifyVenueTeam(supabase, { venueId, orgId: venue.org_id, venueName: venue.name, source })
  );
  ```
- `async function notifyVenueTeam(supabase, { venueId, orgId, venueName, source })`:
  1. `org_members` where `org_id = orgId` and `role in ('owner','manager')` → user ids.
  2. Load `user_preferences(user_id, notifications_venue_scans)` for those ids; **exclude
     only** users with `notifications_venue_scans = false` (missing row = on).
  3. `user_push_tokens` for the remaining users → `expo_push_token[]`.
  4. `const { title, body } = buildVenueScanMessage(source, venueName)`; build one
     `ExpoPushMessage` per token with `data: { type: "venue", venueId }`.
  5. `await sendExpoPush(messages)`.
  - Entire body wrapped in `try/catch` (log on error). It runs in `waitUntil`, so a
    failure can never affect the `track-visit` response.

## Data flow
```
visit recorded (track-visit insert)
  → waitUntil: venueId → org_id → org_members(owner,manager)
  → drop users with notifications_venue_scans=false
  → user_push_tokens → Expo push { title, body, data:{type:"venue", venueId} }
  → (mobile) tap → useNotificationNavigation → VenuePreview
```

## Error handling
- No org members / no tokens / all opted out → `sendExpoPush([])` no-ops; nothing sent.
- Any query or Expo error inside `notifyVenueTeam` is caught and logged; `track-visit`
  still returns `{ ok: true }`.
- `EdgeRuntime.waitUntil` keeps the background task alive after the response is sent.

## Testing
- **Unit (node:test, CI Node 20):** `buildVenueScanMessage` for every source +
  fallback; verify title/body and that `{venue}` is interpolated.
- **Source assertions (readFileSync, repo convention):** `track-visit` selects
  `org_id`/`name`, calls `notifyVenueTeam` via `EdgeRuntime.waitUntil` after the insert
  (and not on the deduped path), filters `role in ('owner','manager')`, respects
  `notifications_venue_scans`, and sends `data.type === "venue"`. Assert the migration
  adds the column and `notify-upcoming-happy-hours` imports the shared sender.
- **Live/manual (post-deploy):** record a real visit and confirm an owner/manager
  device receives the push and tapping opens the venue. (CI can't run Deno; `track-visit`
  itself was verified live this way.)

## Out of scope (fast-follow)
- Profile-screen UI toggle for `notifications_venue_scans` (column + respect ship now;
  the switch is a small follow-up).
- Per-venue push throttling. The 1/device/4h rate limit floors volume, but a very busy
  venue could still generate many owner pushes; revisit if it's noisy.

## Deploy (gated, outward-facing — separate from merge)
`supabase db push` (migration) + `supabase functions deploy track-visit notify-upcoming-happy-hours`.
Backend only — no mobile OTA / native build. Do deliberately with confirmation.
