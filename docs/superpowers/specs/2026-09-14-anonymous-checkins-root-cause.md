# Anonymous check-ins — root cause and fix (2026-09-14)

**Status:** fix landed in this PR; data cleanup is a one-shot SQL run (below), not a migration.
**Symptom:** venue dashboard "Scan activity" card showed rows labeled `Anonymous · Check-in`, and
the `Check-in` chip counted far more than the venue's real check-ins.

## Findings

Table: `public.venue_attribution_events`, `source = 'app_checkin'`. 42 rows on 2026-09-14,
**18 with `user_id IS NULL` (43%)**.

Two different code paths were writing the same `source`:

| Writer | Rows | `user_id` | `session_id` | Meaning |
|---|---|---|---|---|
| `verify-checkin` (staff code / GPS fallback) | 8 | always set | always null | A verified check-in. 1:1 with `public.checkins`. |
| `track-visit` ← mobile **"I'm here 🍻"** button | 34 | best-effort | always set | A presence tap. 18 anonymous, 16 signed-in. |

The "I'm here" button on `VenuePreviewScreen` was the pre-pilot placeholder from the
2026-05-31 QR epic. When the pilot check-in spine shipped (2026-06-10, `verify-checkin` +
`useCheckin` + the geofenced loyalty button on the same screen) the placeholder was never
retired. It called the **public** `track-visit` function with `source: 'app_checkin'`, and
`track-visit` resolves the user only best-effort from the bearer token.

Why the rows were anonymous: the app has guest browse (`App.tsx` → `guestChoice === "skip"`),
and `VenuePreviewScreen` is the QR deep-link landing screen. A guest who scanned a coaster,
installed, and tapped "I'm here" before creating an account produced an anonymous row. The
Sept 4–12 anonymous rows each sit within minutes of a fresh `auth.users` signup at the same
venue — that is the sequence.

Why it also double-counted: signed-in users tapped "I'm here" and then did the real code
check-in seconds later (`db38e1c4` 23:35:35 → `checkins` 23:36:27; `84a8a5b1` 23:37:04 →
`checkins` 23:37:19). Same human, two `app_checkin` rows.

Second hole, unexploited: `apps/directory` `VenueLandingClient` whitelisted `app_checkin`
in its `?src=` pass-through, so `/v/{slug}?src=app_checkin` in any browser would mint an
anonymous check-in. All 34 tap session ids are the mobile `sess-<ts>-<rand>` format, so
nobody used it, but it was live.

Where the label came from: `apps/web/src/components/VenueScanAnalytics.tsx` —
`e.handle ? '@'+handle : display_name || 'Anonymous'`. The separate **Check-ins panel** on the
same page reads `public.checkins` and was always correct; only the Scan-activity card was wrong.

## Retroactive attribution — evaluated and rejected

- Session id → user: 139 anonymous sessions vs 12 known, **zero overlap**. The AsyncStorage
  device id regenerated on most taps (same persistence bug noted in the Aug-19
  `directory_events` analysis), so it never survives long enough to stitch.
- `directory_events.user_id`: null on all 4,462 rows. No bridge.
- Signup-time proximity: 6 of 18 anonymous rows have exactly one signup within 20 min;
  2 have three candidates; 11 (all Jun–Aug) have none. Best case ~33% coverage.
- The matchable ones are the **duplicates**, not new people. Backfilling `user_id` onto them
  would assert check-ins that never happened — the exact number a venue would check.

Decision: do not re-identify. Reclassify by the unambiguous signal instead:
`session_id IS NULL` = real check-in, `session_id IS NOT NULL` = tap. Then remove the taps.

## Fix (this PR)

1. **`apps/mobile/src/screens/VenuePreviewScreen.tsx`** — removed the "I'm here" button, its
   `track-visit` call, `getSessionId`, and the dead state/styles. The geofenced loyalty
   Check In (→ `CheckIn` screen → `useCheckin` → `verify-checkin`) is now the only check-in on
   the screen. It is already sign-in-gated via the earned-signup sheet and already writes the
   `checkins` row, the `app_checkin` attribution row, and the `venue_visits` row.
2. **`supabase/functions/track-visit/index.ts`** — `app_checkin` removed from `VALID_SOURCES`
   (400 if sent); presence bridge removed. `track-visit` is anonymous attribution only.
3. **`supabase/functions/_shared/presence-visit.ts`** — `shouldRecordPresenceVisit` deleted
   (its only caller was the removed bridge). `recordPresenceVisit` unchanged; `verify-checkin`
   remains its sole caller.
4. **`apps/directory/src/app/v/[slug]/VenueLandingClient.tsx`** — `app_checkin` removed from
   the `?src=` whitelist.
5. Tests: mirrors updated; new drift guards fail if `app_checkin` returns to `track-visit`, if
   `track-visit` ever imports the presence bridge, or if `shouldRecordPresenceVisit` is
   reintroduced. `test/venue-events-page.test.mjs` anchor moved from the deleted button to the
   loyalty button.

No schema change. The DB `CHECK` still allows `'app_checkin'` because `verify-checkin` writes it.

Old app builds still carrying the button get a `400` → "Couldn't check in" alert. Acceptable
for a removed feature; nothing is recorded.

## Data cleanup (run once, by hand)

`docs/superpowers/specs/2026-09-14-anonymous-checkins/cleanup_app_checkin_taps.sql` — deletes
the 34 tap rows, scoped to both the predicate and the explicit id list. Ends in `rollback`
for the dry run; swap to `commit` for the real pass. Guards were verified against prod on
2026-09-14: 34 rows to delete / 34 covered by snapshot / 8 real attribution rows / 8
`checkins` rows / 0 triggers on the table.

Restore source: `venue_attribution_events_app_checkin_taps_snapshot_2026-09-14.json` in the
same folder. `public.checkins` and `public.venue_visits` are not touched.

### Second pass (2026-09-18)

By 2026-09-18 the 34 rows were gone, but one new tap row had landed on 2026-09-16 22:35 UTC
(`9cbed694-4526-4e71-8a1c-54c8deeccf9a`, anonymous). The fix reached devices as OTA group
`68cf485f` on 2026-09-15 02:59 UTC (production channel, runtime 1.0.8), but a device only
applies an update on the cold start *after* downloading it, and **1.0.6/1.0.7 can never take an
OTA** (`docs/ota-runbook.md`). The table carries no app version, so which case wrote the row is
unknown.

Deleted by id and the tap predicate, with the same sequence: snapshot → dry run ending in
`rollback` → rollback confirmed in a fresh session → `commit` → verified in a fresh session.
Result: `app_checkin` = 9 rows, all `session_id is null`, 0 taps. Re-checked first: still no
triggers on the table and no foreign keys referencing it.

Restore source: `venue_attribution_events_app_checkin_taps_snapshot_2026-09-18.json`.

**Expect more stragglers** until 1.0.6/1.0.7 installs update from the store. The 09-14 script is
pinned to its 34 ids, so a later pass needs a fresh snapshot and the same sequence.

## Deliberately out of scope

- **Venue-team push on real check-ins.** `track-visit` pushed "Someone just checked in" on every
  tap (including anonymous ones); `verify-checkin` does not push at all. If the venue-side
  notification on a real check-in is wanted, add `notifyVenueTeam` to `verify-checkin` — a
  separate, small change.
- **`scan_session_id` on `verify-checkin`.** `OPTION_B_ATTRIBUTION_SPEC.md` calls for the real
  check-in to carry the originating scan session so QR → install → check-in joins. All 8 real
  rows have `session_id = null`, so the "new face" proof in `COASTER_ONBOARDING_SPEC.md` still
  can't be computed. Needs the device-id persistence fix first.
- **Stable device id.** The AsyncStorage session id regenerates; until that is fixed no
  session-based stitching is possible anywhere.
