# Option B — Presence-Based Attribution Spec

**Status:** Draft for review · June 26, 2026
**Decision:** Attribution is proven at **check-in**, not at download. We do **not** add a deferred-deep-link provider (Branch / AppsFlyer / any MMP).
**Companion docs:** `PILOT_BUILD_SPEC.md`, `DB_SCHEMA.md`.

---

## 1. The decision, stated plainly

We commit to **presence-based attribution**: the unit of truth is a verified check-in (daily code + GPS), which deterministically ties a real human to a real venue on a real service date. The coaster's job is reduced to two things it can do natively and reliably:

1. Open the app directly if installed (Universal Links / App Links — already live).
2. Hand a new user to the correct app store with no extra taps.

**What we give up (on purpose):** linking a *specific physical coaster scan* to a *specific later install* for a brand-new user. Apple passes no install referrer, and our anonymous web `session_id` does not survive a fresh native install. Chasing that requires an MMP we are choosing not to run.

**Why this is fine — arguably better:** a code-confirmed, GPS-confirmed check-in is far harder to fake than an attributed click. We sell venues *proven foot traffic*, not *attributed downloads*. That is a stronger claim and a cleaner App Store privacy story.

---

## 2. The funnel under Option B, and what's measurable at each step

| Step | Installed user | Brand-new user |
|---|---|---|
| Scans coaster | Universal/App Link → app opens to venue | Camera → `/v/{slug}` web landing |
| Pre-install signal | `track-visit` scan event (anon, by medium) | `track-visit` scan event (anon, by medium) |
| Store hand-off | n/a | UA-detected 302 to the right store (**delta D1**) |
| First check-in | code + GPS → `verify-checkin` → `is_first_visit` | code + GPS → `verify-checkin` → `is_first_visit` |
| Attribution truth | First check-in = **new face at this venue** | First check-in = **new face at this venue** |

The scan is a **soft, aggregate** signal ("coasters generated N scans this week"). The check-in is the **hard, per-person** signal ("N new humans walked in"). We report both and never conflate them.

---

## 3. Already built — do not rebuild

| Capability | Where | State |
|---|---|---|
| Branded coaster QR (level-H + iTi mark, `coaster` 2.5" preset) | `packages/venue-qr/index.mjs` | ✅ |
| App opens on scan when installed (iOS + Android, real app IDs) | `apps/directory/public/.well-known/{apple-app-site-association,assetlinks.json}`, `apps/mobile/app.json` | ✅ |
| Anonymous scan event, source from `?src=`, per-(venue,source,session) 4h rate limit | `supabase/functions/track-visit` | ✅ |
| Daily code (deterministic, 6am-CT rotation, profanity-safe) | `packages/shared-api/src/checkin/code.mjs` + `supabase/functions/_shared/checkin-code.ts` | ✅ |
| `verify-checkin` (rate limit, employee exclusion, code+grace, geofence, dedupe, **`is_first_visit`**) | `supabase/functions/verify-checkin` (deployed v1) | ✅ |
| Stamps → Rounds buyback (5 verified check-ins → house round) | `round_redemptions` table, `RoundRedemptionScreen.tsx` | ✅ (confirm wired into nav) |
| Zero-login staff code display | `apps/directory/.../staff/[staff_token]` | ✅ |
| Paying-venue data | `venue_subscriptions` (`status`, `manual_override`, `founding_pilot_until`) | ✅ |
| 6am venue digest | `supabase/functions/send-venue-digest` (deployed v5) | ✅ |

`is_first_visit = !hadPriorAttribution && !hadPriorCheckin` (`verify-checkin/logic.ts`) is the entire attribution primitive. Everything below just feeds and reports on it.

---

## 4. Deltas to implement (ranked; none require an MMP)

### D1 — Zero-tap store routing (the "no extra steps" requirement) · **S, ship-blocking**
Today the no-app path lands on `/v/{slug}` showing *both* store buttons. Add User-Agent detection so a new user goes straight to their store, while the scan is still counted.

- `apps/directory/src/app/v/[slug]/page.tsx` is a server component. Read UA from `headers()`.
- Record the scan **server-side** (service-role insert / `track-visit` call) **before** returning, so the count survives the redirect.
- iOS UA → 302 `APP_STORE_URL`; Android UA → 302 `PLAY_STORE_URL`; desktop/unknown → render the existing landing (QR cards + "Continue in browser").
- Safe because Universal/App Links intercept *before* the web page loads — so if the web landing renders at all, the app is not installed (or the user chose browser).
- Keep a `?nr=1` ("no redirect") escape hatch for QA.

### D2 — Print-medium dimension (so "coasters" is answerable) · **S**
Right now every print piece collapses to `source='qr'`. Add a `medium` so coasters are distinguishable from table tents / stickers — matching the presets already in `venue-qr` (`postcard|table_tent|coaster|sticker|digital`).

- Migration: `alter table venue_attribution_events add column medium text;` (nullable; no enum churn — keep `source='qr'` so the all-QR rollup still works).
- `packages/venue-qr`: `venueQrUrl(slug, { medium })` appends `&m=coaster`; each print job passes its preset key.
- `/v/[slug]`: read `?m=`, pass to `track-visit`.
- `track-visit`: accept `medium`, `cleanStr` it, store it. (Prefer this over adding `coaster` as a `source` value — `source` is the channel, `medium` is the physical format.)

### D3 — Deterministic scan→check-in link for the *installed* path · **M, high-value**
For users who already have the app, we *can* close the loop deterministically (no MMP needed): the same session scans, the app opens, and they check in — all in one session.

- Append the scan `session_id` (or a short-lived scan nonce) to the Universal/App Link payload the app receives.
- `useVenueDeepLink` reads it; `verify-checkin` accepts an optional `scan_session_id` and stamps it onto the `app_checkin` attribution row.
- Result: for installed users you get true scan → check-in linkage (which coaster, then who checked in). New-install users remain aggregate-only — accepted.
- Confirm `useVenueDeepLink.ts` can read a query param off the incoming link before sizing.

### D4 — Metric definitions + venue-facing report/digest lines · **M**
Lock the numbers so the dashboard and the 6am email say the same thing.

- **New faces** = check-ins where `is_first_visit` (per venue, per period). This is the headline.
- **Returning** = check-ins from users with a prior visit at that venue.
- **Scans** = `venue_attribution_events` `source='qr'`, broken out by `medium` (coasters vs other).
- **Scan→check-in rate** = check-ins ÷ scans at the venue level, **labeled as aggregate**, never per-person.
- **Rounds redeemed** = `round_redemptions` count.
- Add a one-line "Coasters: N scans → M new faces this week" to the digest body and the venue stats page. Confirm both already read `checkins` + `venue_attribution_events` (per `PILOT_BUILD_SPEC.md` §4.5/§4.6) and just add the medium breakout.

---

## 5. Explicitly NOT building

- No Branch / AppsFlyer / Adjust / any MMP or SDK.
- No install-level / download attribution for new users.
- No per-person scan→install bridge for the new-install path (aggregate only — by design).
- No change to the Rounds model. Check-in stays a free *stamp* for all pilot venues; redemption is **not** gated on `venue_subscriptions.status` unless you decide otherwise (one-line gate in the redemption path if you want it — separate decision).

---

## 6. Acceptance criteria

1. A new iPhone user scans a coaster and lands in the App Store with **zero intermediate taps**; the scan is counted (visible in venue stats). Same for Android → Play.
2. An installed user scans and the app opens to the venue; checking in with the staff code writes an `app_checkin` row carrying the originating `scan_session_id` (D3).
3. A venue's stats page and 6am digest both report **new faces** (first check-ins) and **scans by medium**, with the scan→check-in rate labeled aggregate.
4. No code path references an MMP/deferred-deep-link provider.

---

## 7. How we talk about it (positioning)

The pitch shifts from "we attribute downloads" to: *"We can't claim a coaster caused a specific install — nobody honestly can on iOS. What we prove instead is that N new humans physically checked in at your bar, each confirmed by a code your staff handed them plus GPS. That's harder to fake than a click, and it's the number that actually predicts revenue."* (Hopkins: measurable proof. Ogilvy: don't overclaim. Chesky: trust beats vanity metrics.) Lead every venue conversation with **new faces**, treat **scans** as the top-of-funnel supporting number, and never imply per-person download attribution we don't have.
