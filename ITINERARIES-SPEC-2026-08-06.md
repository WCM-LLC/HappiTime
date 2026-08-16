# Native Itineraries — Builder Spec (from Growth, 2026-08-06)

**Context:** J wants the daily Tonight-in-KC lineups + Wednesday Walkabout available as
itineraries in the mobile app. V1 shipped today as 7 day-of-week guides (`guides` table,
slugs `kc-monday-itinerary` … `kc-sunday-itinerary` + `kc-wednesday-walkabout`, all
`pending_review` in J's admin queue). This spec is the native v2, informed by what v1
can't do.

## Why guides aren't enough (v1 gaps → v2 requirements)

1. **No structure.** Stops live in markdown; the app can't map them, order them, reroute
   them, or attribute per-stop. → `itineraries` + `itinerary_stops` tables.
2. **No day-awareness.** A Tuesday itinerary shows on Saturday. → `active_dow` on the
   itinerary; surface "Tonight's plan" contextually (home screen slot after 2 PM).
3. **No attribution.** The core business question is proving visits. → per-stop CTA fires
   the existing event logger with `itinerary_id` + `venue_id` + position (extends the
   presence-based attribution model, Option B).
4. **No freshness guard.** Times drift. → nightly job cross-checks each stop's
   `happy_hour_windows` and flags stale itineraries to the admin console (extends the
   8/5 operating-status rule: a stop whose venue goes non-`published` auto-unpublishes
   the stop and alerts).

## Proposed schema (minimum)

- `itineraries`: id, slug, title, subtitle, cover_image_url, city, active_dow int[],
  status (draft/pending_review/published/archived — reuse guides RLS pattern,
  founder-only publish), author_id, created/updated.
- `itinerary_stops`: id, itinerary_id, position, venue_id (FK venues — REQUIRED, no
  free-text venues), suggested_time text, headline text, note_md text, verified_at
  timestamptz, verified_source text.
- View for app: join stops → venues (live name/neighborhood/media/window-of-day) so venue
  edits propagate automatically.

## App surface (v2 minimum)

- "Tonight's Plan" card on home (day-aware) → itinerary detail: ordered stops, map strip,
  per-stop venue page links, share sheet.
- Check-in/"I'm here" per stop (reuses QR/presence attribution) → per-itinerary funnel:
  views → stop taps → venue page opens → check-ins.
- Share link `happitime.biz/itinerary/{slug}` with UTM support (social posts will point
  here instead of the homepage — fixes the venue_id NULL attribution gap from bio links).

## Content ops (Growth side, already in place)

- Wednesday Walkabout list + weekly re-verification: `Marketing Council/tonight-in-kc-system/WEDNESDAY-WALKABOUT.md`.
- Operating-status rule (PLAYBOOK §2, 8/5): every stop verified open same-day before
  publish; `verified_at`/`verified_source` fields exist to enforce this in-product.
- Daily lineups can auto-draft a "Tonight in KC — {date}" itinerary via the run
  (status=draft, J publishes) once tables exist.

## Known related bugs (from 8/6 run — fix alongside)

1. Voltaire bucketed under `/kc/kck/` though address is KCMO (West Bottoms) — city/market
   assignment + 301 needed.
2. Venue pages render `venue_events` times in UTC (Jazz Thursdays shows 1–4 AM) —
   timezone conversion bug, site-wide.
3. Guide pages emit only breadcrumb JSON-LD — itinerary/guide pages should emit
   Article/ItemList schema (SEO gap, known).

## Priority

High leverage: itineraries are the first surface that strings multiple venues into one
session — more venue exposures per user, per-stop attribution, and a shareable object
that isn't a single venue. Suggest sequencing after the auth-pipeline fix (email signups
0 for 3 weeks — nothing downstream matters if signup is broken).
