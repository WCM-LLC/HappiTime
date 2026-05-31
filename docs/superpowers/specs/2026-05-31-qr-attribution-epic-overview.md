# QR attribution & check-in — epic overview

**Date:** 2026-05-31
**Status:** Vision captured; sub-projects specced/built individually.

Captures the full scope discussed so each piece gets its own
spec → plan → implement cycle. Sequenced by dependency + risk. Only the
download button is specced so far.

## Background (already built + verified)

- `venue_attribution_events` table + public `track-visit` edge fn
  (slug/id resolution, `check_rate_limit` dedup of 1 event per
  (venue, source, session) per 4h). Sources:
  `qr | app_checkin | push_click | organic`. Verified end-to-end live
  on 2026-05-31 (insert, dedup, 400/404/405 paths).
- `/v/[slug]?src=qr` directory landing fires `track-visit` then
  deep-links to the app / web fallback.
- QR generation CLI `scripts/generate-venue-qrs.mjs` (branded PNG,
  ECC-H, center "H" badge; encodes `/v/{slug}?src=qr`).
- **Existing check-in system** (do not rebuild): `venue_visits` table
  (`source` default `manual`, `is_private` default false, dwell,
  rating); `record_venue_visit` RPC; automatic geo/dwell check-in via
  `useVisitTracker` (40m proximity → auto check-in w/ 2h cooldown;
  30-min dwell → rating prompt); check-in display via `useUserCheckins`
  / `ActivityScreen`. Privacy today is **private / friends only** —
  `default_checkin_privacy` constraint allows only `('private',
  'friends')`; `harden_venue_visits_rls` migration locks the table down.
- Push infra: Expo (`exp.host/--/api/v2/push/send`), tokens in
  `user_push_tokens.expo_push_token`, send logic in
  `notify-upcoming-happy-hours`.

## Sub-projects

### 1. Venue "Download QR" button — **specced, ready**
Self-service QR download on the venue admin page. Web only. Independent
(shares only the extracted `@happitime/venue-qr` render module).
→ `2026-05-31-venue-qr-download-button-design.md`

### 2. QR check-in + venue-team scan push — **coupled pair, spec next**
The in-app QR check-in fires the `app_checkin` attribution event that is
the *trigger* for the venue-team push, so these are specced together.

- **In-app QR check-in (mobile):** new "Check-In" tab + in-app camera
  scanner (new dep — no camera/barcode lib installed today). Scan →
  parse slug from the encoded URL → resolve venue →
  `record_venue_visit(p_source='qr', …)` (coexists with auto check-in;
  QR is just a new source). Success message; check-in shows in the
  existing display. Also records a `track-visit` `app_checkin`
  attribution event.
- **Venue-team push:** on every *recorded* (non-deduped) attribution
  event, push to the venue's org members (roles **owner + manager**)
  via Expo. **Cadence: every recorded scan, real-time** (dedup already
  floors it at 1/device/4h). Wiring: `track-visit` fires a
  fire-and-forget POST to a new `notify-venue-scan` edge fn after a
  successful insert (alt: Supabase DB webhook on insert). Extract the
  Expo sender into a shared `_shared/expo-push` helper (one sender, not
  two). Tap → open the venue. Recipients default **on**; respect an
  existing prefs mechanism if one is found, else add a toggle as a
  fast-follow.

**Precondition before speccing:** read `harden_venue_visits_rls`, the
friends/friendship table, and `useUserCheckins` / `ActivityScreen` /
`useDiscoverFeed`. Built on the **existing private/friends model** — no
public tier here.

### 3. Truly-public check-in visibility + public feed — **last, deferrable**
Per-check-in visibility picker becomes **private / friends / public**.
The "public" tier is new and the heaviest, riskiest slice:
- `venue_visits` visibility model change (3-state visibility column,
  backfilled from `is_private`).
- RLS rewrite on the deliberately-hardened table to expose public
  visits to all users.
- A public feed surface (candidate: Discover/Activity).
- Privacy implication: broadcasts a user's real-world location to
  strangers — handle deliberately.

Ship sub-project 2 on the private/friends model first; add this as its
own slice once the rest works.

## Open items carried into later specs
- Friends/friendship representation (needed for sub-project 2 & 3).
- Whether a notification-preferences table exists for push opt-out.
- Public feed surface location (sub-project 3).
