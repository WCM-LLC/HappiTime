# Integration Fixes Spec — August 2026

Source: verified integration audit (2026-08-01/06) of the HappiTime monorepo.
Theme: all four fixes are **promotion work, not construction** — sophisticated
backstage automation (edge functions, cron, adapters) that never got surfaced
in user-facing flows. Estimated total effort: **~4 focused days**.

Recommended build order (dependency- and leverage-ranked):

| # | Fix | Effort | Depends on |
|---|-----|--------|------------|
| 1 | Closed-venue detection (`businessStatus`) | ~0.5 day | nothing |
| 2 | Analytics SDK init + event schema | ~0.5 day init, ~1 day instrumentation | nothing |
| 3 | Places autocomplete at venue creation | ~1–1.5 days | nothing (reuses existing key/secrets) |
| 4 | Self-serve vision intake for venue owners | ~1–1.5 days | ideally after #2 (so usage is measured) |

Do #1 and #2-init first — both are sub-day and compound everything else.

---

## Fix 1 — Closed-venue detection in `validate-venue-places`

### Current state (verified)

`supabase/functions/validate-venue-places/index.ts` runs on pg_cron
(migration `20260613220157`), batch 25 venues per run ordered by
`places_validated_at` (nulls first), and:

- fetches `https://places.googleapis.com/v1/places/{placeId}` with
  `X-Goog-FieldMask: formattedAddress` **only**
- computes `addressMatchScore(stored, google)` vs `VALIDATE_MISMATCH_THRESHOLD` (0.7)
- logs to `venue_validation_log`, sets/clears `venues.needs_address_review`
  unless a human resolved it (`address_review_resolved_at` guard)
- treats HTTP 404 (dead place id) as mismatch → review flag

It **cannot see that a venue closed** — Google reports that in the
`businessStatus` field, which is never requested. The May 2026 verification
pass caught closed venues by hand; this automates that.

### Change

**1. Field mask** (one line):

```ts
const placesFieldMask = "formattedAddress,businessStatus";
```

`businessStatus` is a Basic-tier field like `formattedAddress` — same Place
Details Essentials/Pro pricing bucket, no cost change per call.

**2. Carry status through `FetchResult`:**

```ts
type BusinessStatus = "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";

type FetchResult =
  | { kind: "ok"; address: string | null; businessStatus: BusinessStatus | null }
  | { kind: "not_found" }   // dead place id — already treated as review-worthy
  | { kind: "transient" }
  | { kind: "fatal" };

// in fetchGoogleAddress:
return {
  kind: "ok",
  address: body?.formattedAddress ?? null,
  businessStatus: body?.businessStatus ?? null,
};
```

**3. Migration** — add columns (keep closure separate from address mismatch so
the review queue can distinguish them):

```sql
alter table public.venues
  add column if not exists places_business_status text,
  add column if not exists closure_suspected boolean not null default false,
  add column if not exists closure_review_resolved_at timestamptz;

alter table public.venue_validation_log
  add column if not exists business_status text;
```

**4. Handler logic** (inside the per-venue loop, mirroring the existing
resolved-guard pattern exactly):

```ts
const closureSuspected =
  fetched.kind === "not_found" ||
  (fetched.kind === "ok" && fetched.businessStatus === "CLOSED_PERMANENTLY");

// log row gains: business_status: fetched.kind === "ok" ? fetched.businessStatus : null

const closureResolved = v.closure_review_resolved_at != null;
await supabase.from("venues").update({
  places_validated_at: now,
  places_business_status: fetched.kind === "ok" ? fetched.businessStatus : null,
  ...(resolved ? {} : { needs_address_review: mismatch }),
  ...(closureResolved ? {} : { closure_suspected: closureSuspected }),
}).eq("id", v.id);
```

(Add `closure_review_resolved_at` to the select column list.)

`CLOSED_TEMPORARILY` is **logged but not flagged** — seasonal closures and
renovations are common in hospitality; flagging them would flood the queue.

### Admin surface

Extend the existing `/admin/address-review` page (it already exists for
address mismatches): add a "Suspected closed" section or filter reading
`closure_suspected = true`, showing `places_business_status`, last log row,
and two actions — **Confirm closed** (per the delete-over-archive policy:
hard DELETE with cascade + orphan-org cleanup, human-triggered) and
**Dismiss** (sets `closure_review_resolved_at = now()`).

### Explicitly out of scope

- **No auto-unpublish, no auto-delete.** Google mislabels businesses;
  a human confirms every closure. The cron only *flags*.

### Acceptance criteria

- A venue Google marks `CLOSED_PERMANENTLY` shows in the admin review queue
  within one cron cycle; dismissing it prevents re-flagging.
- Address-mismatch behavior is byte-for-byte unchanged for `OPERATIONAL` venues.
- `venue_validation_log.business_status` populates for all new log rows.

---

## Fix 2 — Analytics: initialize a provider and instrument v1 events

### Current state (verified)

`apps/web/src/services/analytics.ts` is a complete provider adapter —
typed switch over `posthog | mixpanel | amplitude | segment`, offline queue
(max 50), `trackEvent` / `identifyUser` / `resetAnalytics` / `flushAnalytics` /
`setAnalyticsContext` exports. Two problems:

1. **No SDK is ever initialized** — the adapter forwards to `window.posthog`
   etc., and nothing puts those objects on `window`.
2. **Zero call sites** — nothing in `apps/web/src` imports the service.
   Every event would no-op even if an SDK were present.

`@vercel/analytics` (page-level traffic) and optional GTM on the directory
site exist but give no per-venue product analytics.

### Decision: PostHog

Free tier 1M events/mo (KC scale won't approach it), autocapture reduces
manual instrumentation, self-serve funnels/retention, and the adapter
already speaks its API shape. Amplitude/Mixpanel remain one env-var away
via the existing adapter — that's the point of the adapter.

### Changes

**1. Dependency + env** (`apps/web`):

```
npm i posthog-js -w web
```

```
NEXT_PUBLIC_ANALYTICS_PROVIDER=posthog
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Add both to `ENV.md` and `.env.example`. `validate-env.mjs` should treat them
as optional (analytics must never block a build).

**2. Init component** — `apps/web/src/components/AnalyticsProvider.tsx`
(client component, rendered once in `app/layout.tsx`):

```tsx
'use client';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { flushAnalytics, identifyUser } from '@/services/analytics';

export default function AnalyticsProvider({ user }: { user: { id: string; email?: string | null } | null }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER !== 'posthog') return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || (window as any).posthog) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: true,
      persistence: 'localStorage+cookie',
    });
    (window as any).posthog = posthog;   // what the adapter looks for
    flushAnalytics();                     // drain the offline queue
    if (user) identifyUser({ id: user.id, email: user.email });
  }, [user?.id]);
  return null;
}
```

Layout passes the Supabase session user (server component already resolves
it for auth gating). On sign-out, call `resetAnalytics()` wherever the
sign-out action lives.

**3. v1 event schema** — instrument these 10, nothing more (each is one
`trackEvent` call at an existing code point):

| Event | Where | Key props |
|---|---|---|
| `venue_viewed` | consumer venue detail | `venue_id`, `source` |
| `search_performed` | search submit | `query_len`, `results_count` |
| `checkin_completed` | check-in flow | `venue_id`, `method` |
| `referral_qr_scanned` | QR landing (PR #104 routes) | `referrer_id` |
| `org_dashboard_viewed` | `/dashboard/orgs/[orgId]` | `org_id`, `venue_count` |
| `subscription_checkout_started` | Stripe checkout CTA | `org_id`, `tier` |
| `subscription_checkout_completed` | Stripe success return | `org_id`, `tier` |
| `intake_extract_completed` | intake capture review step | `venue_id`, `provider`, `windows_count` |
| `claim_published` | `/claim/[token]` publish | `venue_id` |
| `digest_link_clicked` | UTM (`utm_source=venue_digest`) on digest links | (via PostHog UTM capture) |

Property conventions: always `venue_id`/`org_id` as UUIDs, never emails or
names in props (ids only — PII lives in `identifyUser` traits, minimal).

**4. Digest UTM tagging** — in `send-venue-digest`, append
`?utm_source=venue_digest&utm_medium=email` to console links so digest→console
engagement becomes visible per venue. One-line template change.

### Why now

The Phase-2 pricing trigger is 25–30 paying venues. The value argument to a
venue is "X people viewed you, Y checked in, Z came from your QR" — none of
which is answerable today. Every week uninstrumented is a week of missing
evidence.

### Acceptance criteria

- Events visible in PostHog within minutes of deploy; identify ties events
  to Supabase user ids; no PII in event props.
- With env vars unset, zero console errors and zero network calls (adapter
  already no-ops on `provider: none` — verify).

---

## Fix 3 — Google Places autocomplete at venue creation

### Current state (verified)

All Places machinery runs **after** a venue row exists: `import-places`
(cron via `invoke_places_import`) enriches rows missing data and pulls
photos→Cloudinary; `geocode-venues` backfills lat/lng; scripts do batch
passes. Venue creation paths — admin staging promotion (Apify pipeline),
admin CRM manual entry — are **typed by hand**, with no autocomplete, no
`places_id` at birth, and enrichment arriving whenever cron catches up.
Prod key is stored as `GOOGLE_GEOCODING_API_KEY` (Places API v1 enabled);
`GOOGLE_PLACES_API_KEY` is unset — reuse that convention.

### Goal

Any venue created through the console is born with a verified `places_id`,
canonical address, lat/lng, phone, and website — entered in ~10 seconds via
autocomplete instead of ~5 minutes of typing, and never waiting on cron for
the basics.

### Design

**1. Server proxy routes** (key stays server-side; never ship it in
`NEXT_PUBLIC_*`):

- `POST /api/places/autocomplete` — body `{ input, sessionToken }`.
  Proxies Places API v1 `places:autocomplete` with
  `includedRegionCodes: ["us"]` and `locationBias` = KC metro circle
  (39.0997, -94.5786, r=80km). Returns `{ suggestions: [{ placeId, mainText,
  secondaryText }] }`. Auth: signed-in console user (admin OR org member) —
  this route will serve the future self-serve claim flow too.
- `POST /api/places/details` — body `{ placeId, sessionToken }`.
  Field mask: `id,displayName,formattedAddress,addressComponents,location,
  nationalPhoneNumber,websiteUri,businessStatus`. Returns a normalized
  venue-prefill object (street/city/state/zip split from addressComponents —
  reuse the component-parsing already written in `import-places`).

**Session tokens are the cost model**: generate a UUID client-side when the
user starts typing, send it on every autocomplete call and the final details
call. Google then bills the whole session as one Autocomplete session
(~$0.017) instead of per-keystroke. Debounce 300ms, minimum 3 characters.

**2. Client component** — `VenueAddressAutocomplete.tsx` (shared):
text input → suggestion dropdown → on select, calls details and fires
`onResolve(prefill)`. Keyboard-navigable, and always offers a final
"Enter manually" row (new venues, pop-ups, and stadium concourses aren't
always in Google).

**3. Mount points**, in order:

1. **Admin CRM / manual venue add** — highest immediate value; prefill the
   whole form, write `places_id` + `places_status='matched'` on insert.
2. **Admin staging promotion** — when promoting an Apify-staged row, show the
   autocomplete pre-seeded with the staged name+address so the promoter
   confirms the Google match in one click (kills the address-typo class that
   `validate-venue-places` exists to catch).
3. **(Later) self-serve owner claim/add** — the component and routes are
   already role-agnostic by design; no rework needed when that flow ships.

**4. On create with a `places_id`:** insert the row, then invoke the existing
`import-places` function for that venue id (or simply let the next cron run
pick it up — it selects rows with missing data) so photos→Cloudinary flow
unchanged. **Do not duplicate photo logic in the web app.**

**5. `businessStatus` at birth** (synergy with Fix 1): if details returns
`CLOSED_PERMANENTLY`, warn inline before allowing create — stops closed
venues from ever entering the funnel.

### Cost controls

Session tokens (above), server-side LRU cache on details by `placeId`
(24h TTL — details of a just-created venue never need refetching), and only
caching fields Google's terms permit to be stored (`id` is storable
indefinitely; address/phone/website are stored as *your* venue record after
human confirmation, which is the existing enrichment model).

### Acceptance criteria

- Creating a KC venue via admin CRM: type 3+ chars, pick a suggestion, form
  fully prefilled, saved row has `places_id`, lat/lng, split address.
- One create session = one autocomplete session billed (verify in Google
  Cloud console metrics).
- Manual-entry fallback still works with no Places call.

---

## Fix 4 — Self-serve vision intake for venue owners

### Current state (verified)

`/intake/capture` is a phone-friendly flow: pick venue → snap happy-hour
sign → `/api/intake/extract` (Gemini 2.5 Flash default, free tier 15 RPM /
1,500 per day; Claude fallback) → review/edit → commit, with an optional
owner-confirmation toggle (off = auto-publish, on = draft + signed email
link that `/claim/[token]` flips to published). Every entry point —
page and all `/api/intake/*` routes — is gated by `isAdminEmail`.

### Goal

An org owner/manager scans **their own** menu and their listing updates —
with the data-quality bar intact (nothing auto-publishes without review).
This is the onboarding wow-moment: "photograph your chalkboard, your happy
hour is live today."

### Authorization model

Replace the binary admin gate with a two-tier check in the intake page and
`/api/intake/extract` + `/api/intake/commit`:

```
canUseIntake(user, venueId):
  if isAdminEmail(user.email)                          → admin tier
  else if org_members has (user, role in owner|manager)
       for the org owning venueId                      → owner tier
  else                                                 → 403
```

Owner tier differences, enforced **server-side in commit** (not just UI):

| Capability | Admin | Owner |
|---|---|---|
| Venue picker | all venues | only their org's venues |
| Auto-publish toggle | yes | **hidden & rejected server-side** |
| Commit result | publish or draft+confirm-link | **always draft + review-queue entry** |
| Daily extract cap | none | 10/user/day |

### Review queue

Owner commits create the menu as `draft` (existing commit path already
supports draft) plus a row in a review queue surfaced in the existing
`/admin/suggestions` area (same pattern as the autotagger's
`tag_suggestions` — reuse the pattern, not necessarily the table):
`intake_submissions (id, venue_id, submitted_by, menu_id, status
pending|approved|rejected, created_at)`. Admin approves → menu flips to
published (same one-line status flip `/api/intake/claim` already does);
rejects → menu stays draft with a reason.

Owner gets an email (Resend, same sender infra as the digest) on approve/
reject. At current volume approval is minutes of work per week; if it ever
isn't, that's a good problem and the flag can loosen per-org.

### Rate limiting & cost

Gemini free tier is 1,500/day — a per-user cap of 10 extracts/day
(count `intake_submissions` + extract calls per user per service day, return
429 with a friendly message) means even 50 active venue users can't dent it.
Log provider + latency per extract (feeds the `intake_extract_completed`
analytics event from Fix 2).

### UX entry point

Card on `/dashboard/orgs/[orgId]`: **"Scan your happy hour menu"** → routes
to `/intake/capture?venue=<their venue>` (pre-selected when the org has one
venue). The capture flow is already mobile-friendly — unchanged apart from
hiding the auto-publish toggle for owner tier.

### Rollout

- Feature flag `INTAKE_SELF_SERVE_ENABLED` (env) — ship dark, enable for
  founding/pilot orgs first by simply telling them it exists.
- Position it in the Verified-tier sales conversation: "update your listing
  yourself, from your phone, in under a minute."

### Acceptance criteria

- Org owner sees only their venues; commit as owner always lands as draft +
  queue entry even if the request is hand-crafted with `autoPublish: true`.
- Admin flow is unchanged.
- 11th extract of the day returns 429 with a human-readable message.
- Approval email arrives; approved menu is consumer-visible.

---

## Sequencing & success metrics

Week 1: Fix 1 (morning) + Fix 2 init & first 4 events (afternoon) → deploy.
Week 1–2: Fix 3 routes + component into admin CRM, then staging promotion.
Week 2: Fix 4 behind flag; pilot with 2–3 founding venues.

Measure (via Fix 2, 30 days after each ships):

- Fix 1: closed venues flagged vs. found manually (target: manual finds → 0)
- Fix 2: % of active venues with ≥1 tracked view/check-in (baseline-setting)
- Fix 3: median time-to-create a venue in admin (target: <60s) and % of new
  venues born with `places_id` (target: 100%)
- Fix 4: owner-submitted menu updates per week; time from photo to published
  (target: same-day)
