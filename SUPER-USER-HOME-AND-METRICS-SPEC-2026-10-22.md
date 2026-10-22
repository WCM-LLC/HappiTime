# Super User Home + Metrics — SPEC (2026-10-22)

**Owner:** Builder · **Requested by:** J · **Priority:** P1 for Phases 0–1 (ship this week), P2 for 2–3, P3 for 4–5 · **Status:** BUILT 2026-10-22 (all phases, uncommitted in working tree). DB function `super_user_metrics` / `venue_guide_stats` applied to prod (migration `20261022182448_super_user_metrics.sql`). Mobile OTA published to **preview** (group `451c3e89-b9ec-4436-89af-f53698e6bbf8`, runtime 1.0.9, env verified) — production promotion (`--branch master`) pending J's device check per `docs/ota-runbook.md`. Web/directory deploy on push to master.

**Build notes / deviations from the plan above**
- Guide → people-sent attribution reuses the companion-itinerary rail (`record_itinerary_touch`) rather than a new `guide_click` touch kind; the trigger and touches table are untouched. Mobile guide opens/taps log `itinerary_view` / `itinerary_venue_tap` on the companion list, plus `user_events` `guide_view` / `guide_venue_click` for counts.
- In-app QR scans (`/r/{handle}` opened by a signed-in user via Universal Link) log `user_events` `qr_scan` so they are not invisible; web scans log `directory_events` page_view with `meta.referrer_handle`.
- Markdown in the app is rendered by `components/GuideMarkdown.tsx` (dependency-free) so the feature ships OTA with no native rebuild.
- AASA does **not** yet include `/guides/*`: adding it before every installed binary has the OTA would open web guide links into an app that can't route them. Add after production OTA adoption.
- Admins who are not Super Users keep the org dashboard; Super Users with orgs reach it at `/dashboard?view=orgs`.

**Related:** `MAGIC-LINK-CROSS-DEVICE-FIX-SPEC-2026-10-22.md` (login path), `HappiTime_SuperUser_Attribution_QR_Spec.md`, `OPTION_B_ATTRIBUTION_SPEC.md`

## The ask (J, 2026-10-22 12:47 CT)

> When the super user logs in, the webpage opens up to a new guide. It needs to open up to the dashboard,
> and the dashboard needs to have a peek at the metrics and currently published guides with statistics.
> There should be a page purely dedicated to metrics and it needs to look VERY good.

## Ground truth (verified in repo + prod DB, 2026-10-22)

| Fact | Where |
|---|---|
| Super User login defaults to `/dashboard/guides/new` | `auth-paths.ts` `GUIDE_EDITOR_PATH`; used as default `next` in `super-user/login/page.tsx:24`, `login-actions.ts:146,149`; middleware fallback is `/dashboard/guides` |
| `/dashboard` is the **venue-owner org dashboard** (organizations, members). No Super User home exists | `app/dashboard/page.tsx` |
| Super User pages today: `/dashboard/guides`, `/guides/new`, `/referrals`, `/profile`, `/events` | `SUPER_USER_PATHS` in `auth-paths.ts` |
| **Zero guide analytics exist.** Public guide pages have no `PageTracker`; `directory_events` has no `/guides%` rows; `user_events` has no guide/itinerary events | `apps/directory/src/app/guides/page.tsx`, `guides/[slug]/page.tsx` — compare `kc/page.tsx:196` which does track |
| Influence metrics **do** exist and are correct: `super_user_traffic_summary` (influenced_checkins, influenced_new_faces, influenced_venues, first_checkins_driven, venues_touched, redemptions_driven), `super_user_referral_summary` (referees, itinerary_saves), `super_user_venue_influence` (per venue), `checkin_super_user_attributions`, `super_user_venue_touches` (raw) | DB; surfaced today only on `/dashboard/referrals` |
| Scale: 13 published / 26 total guides, 5 authors. J's own `super_user_traffic_summary` row is null (no influence yet) → most Super Users will see zeros at launch | DB |
| Design system exists | `HappiTime-Design-System/` + `apps/web/DESIGN.md`; tokens already used (`text-display-md`, `text-heading-sm`, `--width-content`) |

**Consequence:** Phase 3 (the metrics page) is only as good as the data under it. Phase 1 (instrumentation) is the
time-sensitive work — every day it isn't shipped is a day of guide history that never exists.

---

## Metric-by-metric audit — what is live TODAY (verified in prod, 2026-10-22 13:10 CT)

All three summary objects (`super_user_traffic_summary`, `super_user_referral_summary`,
`super_user_venue_influence`) are **plain SQL views** — computed on read, so they are real-time by construction.
No cron touches them. The question is whether anything *feeds* them.

| Metric on the mockups | Source today | Live? | Reality check |
|---|---|---|---|
| People you sent to venues (influenced_checkins) | `checkin_super_user_attributions` where `basis='venue_touch'` ← trigger `checkins_attribute_super_user` on `checkins` insert (fired by `verify-checkin` edge fn) | **Yes, wired end-to-end** | **2 attribution rows exist, both `basis='referral'` → every Super User shows 0.** Touches are the missing input: `super_user_venue_touches` has 7 rows, all `kind='itinerary_view'`. No QR touch, no guide touch exists. |
| New faces | same, `is_first_checkin` | Yes | 0 for everyone, same reason |
| Venues moved / touched | same + `user_referrals` join | Yes | `1extrababe`: 2 first check-ins driven via referral. Everyone else 0. |
| Redemptions driven | `round_redemptions` × `user_referrals` | Yes | 0 rows |
| Referrals (joined) | `user_referrals` ← `record_referral` RPC from app onboarding (code entry) | **Yes, live** | jwill86 = 5 (last Oct 5), 1extrababe = 2 |
| QR scans | — | **No** | `/r/[handle]` landing page has **no tracking**; 0 `directory_events` rows for `/r/%`. The mockup's "14 QR scans" does not exist. |
| Itinerary saves | `super_user_credit_events` kind=`itinerary_save` | Yes | 0 rows ever |
| Guide views | — | **No** | No `PageTracker` on guide pages. 0 rows. |
| Venue clicks / CTR | — | **No** | Not instrumented. |
| Guide → people sent | — | **No** | Needs `kind='guide_click'` touches (Phase 1 §2) |
| Milestones | derived | n/a | Trivial once the above exist |
| Deltas vs prior 28d | derived | n/a | Views have no time filter; Phase 1 §4 adds `_daily` |
| Check-ins volume (the denominator) | `checkins` | Yes | **13 check-ins ever, 1 in the last 7 days.** `user_events` holds 62 `auto_checkin`/`venue_checkin` rows — confirm those aren't a second, untracked check-in path. |

**Bottom line for J:** the influence pipeline is correctly built and real-time, but it is a pipe with almost nothing
flowing through it. Three inputs are missing — QR-scan touches, guide-click touches, and page tracking — and the
whole platform has 13 check-ins. Phase 1 is the fix for the inputs; check-in volume is a product/marketing
problem the metrics page cannot solve.

**Phase 1 addendum (from the audit):**
- §2b **QR landing touch.** `/r/[handle]/page.tsx` must (a) `trackEvent({eventType:'page_view', pagePath:'/r/<handle>', meta:{referrer_handle}})` and (b) when the viewer is signed in, call `record_itinerary_touch`-style RPC to write a `super_user_venue_touches` row `kind='qr_scan'` (venue optional). Without this, "QR scans" stays a fiction.
- §2c Confirm `user_events` check-ins vs `checkins` table — if the app writes both, attribution only sees `checkins`.

## Phase 0 — Land on home, not the editor (≤ 1 hr) — SHIP FIRST

1. `auth-paths.ts`: add `export const SUPER_USER_HOME_PATH = '/dashboard';` and `METRICS_PATH = '/dashboard/metrics'`; add
   `METRICS_PATH` to `SUPER_USER_PATHS`.
2. Replace the `GUIDE_EDITOR_PATH` **defaults** (not the editor route itself) with `SUPER_USER_HOME_PATH`:
   `super-user/login/page.tsx:24`, `login-actions.ts:146` (`?? GUIDE_EDITOR_PATH`), `:149`, the OAuth button
   `next` default, and the middleware `fallback` for `SUPER_USER_LOGIN_PATH` (currently `/dashboard/guides`).
   An explicit `?next=` still wins — deep links from emails keep working.
3. `/dashboard` must not gate on `isGuideAuthoringPath` for the home itself (it isn't in `SUPER_USER_PATHS`); the
   role branch happens inside the page (Phase 2). Until Phase 2 ships, Phase 0 alone lands Super Users on the
   org dashboard — acceptable for a few days, **not** acceptable to leave. Ship 0 and 2 in the same week.

## Phase 1 — Instrument guides (½ day) — SHIP THIS WEEK

Reuse the existing pipeline; no new tables.

1. **Views.** Add `<PageTracker pagePath={`/guides/${slug}`} />` to `apps/directory/src/app/guides/[slug]/page.tsx`
   and the 5 hand-built guide pages under `app/guides/*/page.tsx`, plus `/guides` index. Extend `trackEvent` /
   `PageTracker` to accept `meta` and pass `{ guide_id, author_id }` — `directory_events.meta` is jsonb already.
2. **Guide → venue clicks.** Every venue link rendered inside a guide body goes through `TrackedLink` with
   `eventType: 'cta_click'`, `venueId`, `meta: { guide_id, author_id, cta: 'guide_venue' }`. This is the
   monetizable number — it is what lets us tell a venue "guide X sent you N people" and sell Featured placement
   inside guides. Also fire a `super_user_venue_touches` row (`kind='guide_click'`) so clicks flow into the
   existing influence attribution (see attribution spec; confirm `kind` enum/constraint first).
3. **Mobile.** The app does not render guides today (J, 2026-10-22). Guides-in-app is now **Phase 4** below; when
   it ships it mirrors (1)–(2) via `user_events` (`event_type='guide_view' | 'guide_venue_click'`,
   `meta.guide_id`). `guide_stats` must union `directory_events` + `user_events` from day one so the view
   doesn't need rework when Phase 4 lands — add the `user_events` arm now, it just returns 0 rows until then.
4. **View `public.guide_stats`** (security-invoker; RLS via `guides.author_id = auth.uid()` or admin):

   | column | source |
   |---|---|
   | `guide_id`, `author_id`, `title`, `slug`, `status`, `published_at` | `guides` |
   | `views_7d`, `views_28d`, `views_all`, `sessions_28d` | `directory_events` `page_view` where `meta->>'guide_id'` |
   | `venue_clicks_28d`, `venues_clicked_28d` | `directory_events` `cta_click` meta.cta='guide_venue' |
   | `ctr_28d` | clicks / views, null when views < 20 (don't show CTR on tiny denominators) |
   | `checkins_influenced_28d` | `checkin_super_user_attributions` joined via `touch_id` → `super_user_venue_touches.kind='guide_click'` and `subject_id = guide_id` |

   Plus `public.guide_stats_daily(guide_id, day, views, venue_clicks)` for sparklines (materialized, refreshed by
   the existing nightly cron, or a plain view if cheap — 6k events total today, a view is fine for now).

5. Backfill: none possible. Say so in the UI ("Tracking since Oct 2026").

## Phase 2 — Super User Home at `/dashboard` (1–1½ days)

`app/dashboard/page.tsx` branches on `user_profiles.role`:
- `super_user` (and admins who are also super users) → **Super User Home** (below). Admins keep a link to the
  org dashboard and `/admin`.
- everyone else → existing org dashboard, untouched.

**Super User Home layout** (one screen, no scrolling past the fold on a laptop):

1. **Header** — avatar, display name, `@handle`, "Tastemaker since <month>", primary CTA **New guide**, secondary
   **My QR**.
2. **Peek row — 4 stat tiles, 28-day window, with delta vs prior 28d:**
   People you sent to venues (`influenced_checkins`) · New faces (`influenced_new_faces`) · Guide views
   (`sum views_28d`) · Referrals (`referees`). Each tile links to the matching section of `/dashboard/metrics`.
   Influence first, views third — on purpose. Influence is the proof a creator can take to a venue; views are
   support.
3. **Published guides** — table of `status='published'` guides from `guide_stats`: cover thumb, title, published
   date, 28d views, venue clicks, people sent, 28d sparkline, **Edit** / **View live**. Sorted by views_28d desc.
   Drafts collapsed below ("3 drafts →" to `/dashboard/guides`).
4. **Side column** — "Venues you're moving" top-5 from `super_user_venue_influence`; "Next up" nudges
   (socials prompt moves here from the banner; "Your QR hasn't been scanned yet — print it"; "No guide in 30
   days").

Empty/early states are first-class: a tile with 0 says what will make it move ("Shows up when someone checks
in after opening your guide"), never a bare zero. Guide rows with < 20 views show "—" for CTR.

## Phase 3 — `/dashboard/metrics` (2 days + design pass) — the "VERY good" page

**Promise of the page:** *see your reach, prove it to a venue, know what to publish next.* Not a BI tool.

**Structure (top → bottom):**
1. **Range control** — 7d / 28d / 90d / All, persists in URL (`?range=28d`), default 28d. Everything below
   recomputes. Comparison deltas vs the prior equal window.
2. **Reach hero** — one large number: *People you sent to venues* with delta, under it a single area chart of
   daily influenced check-ins + guide views (two series, same axis, legend). This is the screenshot a Tastemaker
   posts.
3. **Three columns: Influence · Guides · Referrals** — kept apart deliberately, matching the existing
   "influence ≠ referral" distinction in `referrals/page.tsx:100`.
   - Influence: influenced check-ins, new faces, venues touched, redemptions driven; **Venues you move** ranked
     bar list (venue, people, new faces, last check-in).
   - Guides: per-guide cards — views, venue clicks, CTR (≥20 views), people sent, sparkline; sortable. Click →
     guide drill-down panel (daily series + the venues it sent people to).
   - Referrals: referees over time, QR scans (if `/r/[handle]` lands log to `directory_events` — verify; if
     not, add `page_view` with `meta.referrer_handle` in Phase 1), itinerary saves.
4. **Milestones strip** — first 10 people sent, first 100 guide views, 5 venues moved, etc. This is what makes
   the page good at zero: progress toward the first milestone instead of an empty chart.
5. **Share** — "Copy stats card" produces a 1080×1350 PNG (existing `feedback_visual_render_pipeline` SVG→PNG
   approach, server route). **Co-branded (decided 2026-10-22):** Tastemaker avatar + display name + `@handle`
   lead the card; hero number; top 3 venues; HappiTime mark + `happitime.biz/author/<slug>` in the footer.
   Creator-shareable, venue-pitchable, brand-carrying. Scope it tight: one template, two ratios max
   (1080×1350 feed, 1080×1920 story).

**Design requirements:**
- Use the design system tokens only (`HappiTime-Design-System/`, `apps/web/DESIGN.md`). No ad-hoc colors.
  Charts: 2 series max per chart, brand accent + neutral, no gradients-for-decoration, labelled axes, values
  on hover, dark mode works.
- Numbers use tabular figures; deltas colored only when the direction is meaningful (a drop in views is
  neutral-grey, not red — creators churn on red).
- Mobile: tiles 2-up, charts full-width, table becomes cards. Tastemakers will open this on a phone from the
  magic-link email.
- Every metric has a one-line definition on hover/info — the same wording as the tile on Home. Definitions
  come from this spec, not invented per component.
- Design review before build: produce a mockup (Claude Design or Figma) for J's approval. Do not ship Phase 3
  straight from code.

## Phase 4 — Guides in the mobile app (2–3 days, mobile) — DECIDED 2026-10-22

The app has no guide surface. Add one, instrumented from the first build:
1. **Guides tab / entry** — list of published guides (`guides` where `status='published'`, with
   `public_guide_authors` for byline/avatar) ordered by `published_at` desc; city filter inherits the app's
   current city.
2. **Guide detail** — render `body_md` with the app's markdown renderer; venue mentions resolve to in-app venue
   screens (not web links). Author block links to the author's socials.
3. **Tracking** — on open: `user_events` `event_type='guide_view'`, `meta.guide_id`, `meta.author_id`;
   on venue tap: `event_type='guide_venue_click'`, `venue_id`, `meta.guide_id`; and a
   `super_user_venue_touches` row (`kind='guide_click'`, `subject_id=guide_id`) so app taps feed the same
   attribution as web clicks. One attribution path, two surfaces.
4. **Deep link** — `happitime://guides/<slug>` and universal link `https://www.happitime.biz/guides/<slug>` open
   in-app when installed. Super Users' share links then work on both surfaces.
5. Store release required. Sequence after Phase 1 (web) so `guide_stats` is already unioning both sources.

## Phase 5 — Venue-side "Guides sending you people" (1 day, after Phase 1 has data) — DECIDED 2026-10-22

On the venue-owner dashboard (`/dashboard` org view → venue page), add a **Guides** panel:
- Table: guide title (link), author `@handle`, venue clicks 28d, people sent 28d (attributed check-ins at this
  venue via `guide_click` touches), first/last seen.
- One-line framing: "N Tastemaker guides sent people to <venue> this month."
- This is the Featured-placement sales hook: a venue seeing a guide move people is the moment to offer
  Featured ($99) or placement in that guide. Revenue agent owns the pitch; Builder owns the panel. Keep the
  panel factual — no upsell copy inside the product until the offer is defined.
- RLS: venue owners see only their venues' rows; author handle is public data (`public_guide_authors`).

## Definitions (single source — reuse verbatim in tooltips)

- **People you sent to venues** — check-ins by someone within the attribution window after a touch from you
  (QR, referral, guide click). Source: `checkin_super_user_attributions`.
- **New faces** — of those, people checking in at that venue for the first time.
- **Venues you're moving** — distinct venues with ≥1 attributed check-in in range.
- **Guide views** — page views of your published guides on happitime.biz. Tracked since Oct 2026.
- **Venue clicks** — taps from your guide to a venue page.
- **Referrals** — accounts created through your QR or link.

## Acceptance

- [ ] Phase 0: magic link / Apple / Google from `/super-user/login` with no `next` lands on `/dashboard`; `?next=` still honored.
- [ ] Phase 1: open a published guide on happitime.biz → `directory_events` row with `page_path='/guides/<slug>'`, `meta.guide_id`; click a venue in it → `cta_click` row with `venue_id` + `meta.guide_id`; `guide_stats` reflects both within a minute.
- [ ] Phase 1: `guide_stats` is readable by the author and admins only (RLS test as a second super user).
- [ ] Phase 2: Super User sees Home, venue owner sees org dashboard, admin sees Home with org + admin links. Zero-state copy present on every tile.
- [ ] Phase 3: 7d/28d/90d/All switch recomputes all sections; prior-window deltas correct (spot-check against SQL); page renders well at 390px; stats-card PNG downloads.
- [ ] Phase 4: open a guide in the app → `user_events` `guide_view` row; tap a venue → `guide_venue_click` + `super_user_venue_touches` row; `guide_stats.views_28d` increments from the app source.
- [ ] Phase 5: venue owner sees the Guides panel for their venue only; counts match `guide_stats` filtered to that venue.
- [ ] No new `any`-typed Supabase rows; types regenerated.

## Design mockups (2026-10-22, approved pending J's review)

Claude Design canvas **"Super User Home & Metrics"** — five artboards: Home (desktop), Metrics (desktop),
Home zero state (first week), Metrics (phone 390), co-branded stats card (1080×1350). Sample data; the layout,
hierarchy, copy and zero-state behaviour are the spec. Build to it, not around it.

**Logo:** the wordmark J supplied on 2026-10-22 (copper "HappiTime" with the disc behind "iTi") is canonical.
`HappiTime-Design-System/project/assets/logo.svg` on disk is an older mark — do not use it. Ask J for the
SVG/source of the new wordmark and add it to `apps/web/public/` and the design-system bundle.

## Decisions (J, 2026-10-22 12:54 CT)

1. Mobile app does not render guides → build it (Phase 4), instrumented from day one.
2. Stats card is co-branded: Tastemaker identity leads, HappiTime mark + author URL in footer.
3. Venue-side "Guides sending you people" panel is in (Phase 5), after Phase 1 data exists.
4. Design pass on Home + Metrics happens before Phase 2/3 code — mockups via Claude Design for J's approval.

## Not in scope

Saves/bookmarks of guides (no feature exists), follower counts, cross-city metrics, exporting CSVs, venue-side analytics beyond the Phase 5 Guides panel, in-product upsell copy.
