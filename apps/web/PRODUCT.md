# Product

<!-- impeccable:product-schema 1 -->

Scope: this record covers **`apps/web`, the HappiTime owner/admin console** (`console.happitime.biz`).
Shared product truth is included where the console depends on it. Sibling surfaces —
`apps/directory` (public SEO site, port 3001) and `apps/mobile` (Expo consumer app, re-exported
by `apps/android`) — are described only as operating context, not documented here.

## Platform

web

## Users

**Confirmed primary: both audiences, with the internal admin half as the daily driver.** Venue
owners self-serve, but the operating team spends most of its console time in admin/CRM, staging,
and intake review. Design work on this surface should weight the internal tooling accordingly.

Five distinct audiences touch the product; the first two are the console's users.

- **Internal operating team (Super Admin).** Platform operators on an email allowlist
  (`admin_users`, `supabase/migrations/20260429120000_admin_users.sql`). They run venues through a
  pipeline, review every inbound data path, manage plans and users, and moderate content. Their
  surfaces are `/admin/*` and `/super-user/login`. This is the heaviest-used half of the console.
- **Venue owners, managers, and staff.** Org-scoped roles `owner`, `manager`, `host`, `admin`,
  `editor`, `viewer` (`org_members.role`, `venue_members`). They claim listings, maintain happy-hour
  windows and menus, download QR assets, read scan analytics, ratify a Toastmaker, and pay for
  tiers. Entry is a signed claim token or org membership. Tenant isolation is by org membership plus
  venue assignment.
- **HappiTime Insider (DB role `super_user`).** A trusted content creator who authors neighborhood
  guides in the console. Cannot reach `/admin/*`, cannot approve others' guides, cannot promote
  users. A Super Admin may set `auto_publish_enabled` per user to skip the review queue.
  Full spec: `docs/super-user-role.md`.
- **Consumers.** Browse published listings on the directory and mobile app; report staleness. Not
  console users.
- **In-venue staff, unauthenticated.** Token-gated page at
  `apps/directory/src/app/staff/[staff_token]/page.tsx`. Not a console user.

RLS helper functions (security definer): `is_org_member`, `is_org_owner`, `is_org_manager`,
`is_org_host`, `has_venue_assignment` (`RLS.md`, `supabase/migrations/20260108071000_rls_core.sql`).

## Product Purpose

HappiTime is a happy-hour discovery marketplace for the Kansas City metro, with a paid
venue-listing business on top. Consumers find what is on right now, sorted by what ends soonest;
venues pay to be visibly current and to fill slow hours.

The console is the operational spine of that marketplace. Its job is to get venue data in, get it
reviewed, get an owner to vouch for it, and keep it fresh — then prove the resulting traffic back to
the venue so a paid tier is worth renewing.

Success for the console is: listings reach `published` without an operator hand-editing rows; owners
confirm their own hours rather than the team guessing; and disputes get resolved by a real
re-confirmation instead of an incidental edit.

**Confirmed stage: pilot / early access.** Real venues are onboarded; revenue is pre-revenue or
heavily discounted. `PILOT_BUILD_SPEC.md`, `COASTER_ONBOARDING_SPEC.md`, and the Pilot Phase 1/2/3/5
plans in `docs/superpowers/plans/` are live workstreams, and `docs/pilot-toastmaker-runbook.md` plus
`docs/pilot-deploy-runbook.md` indicate the pilot actually ran. Do not describe the product as
having established paid traction.

## Positioning

Freshness that a competitor cannot credibly copy by scraping. The product's differentiating
mechanism is a **verification and dispute loop that ties a human claim to a timestamp**:

- every venue carries `last_confirmed_at` and a `listing_disputed` flag;
- consumers can contest a listing in three taps, and two distinct open reporters within 14 days
  auto-disputes the venue;
- owners resolve disputes by re-confirming, not by an operator overriding a row;
- paid tiers buy visible currency and placement, not just a bigger card.

A static aggregator can list the same bars. It cannot show that a specific human stood behind these
hours on a specific date, nor let the crowd call it stale.

Second, the attribution loop (QR check-in → referral credit → Toastmaker) turns the listing into a
measurable traffic source, which is what makes a $49–$99/mo line item defensible to a GM.

## Operating Context

**Three surfaces over one Supabase Postgres project (`HappiTime-Main`).**

| Surface | What it is |
|---|---|
| `apps/web` | Owner/admin console, `console.happitime.biz`. 43 pages, 48 API routes, ~14.4k LOC. Legacy `happitime-console.vercel.app` still resolves. |
| `apps/directory` | Public SEO site, `happitime.biz`, port 3001. Neighborhood landing pages, editorial guides, `/pricing`, legal pages, `/llms.txt`. |
| `apps/mobile` | Expo consumer app; `apps/android/App.tsx` is a one-line re-export, so there is no separate Android source tree. |

**The console's real center of gravity** is `orgs/[orgId]/venues/[venueId]/page.tsx` (~1,883 LOC —
windows, menus, QR, disputes, Toastmaker, scan analytics) and `orgs/[orgId]/page.tsx` (~1,411 LOC).
`apps/web/src/app/page.tsx` is a 5-line redirect stub; **the console has no marketing page at all.**
`apps/web/public/` does not exist.

**Three distinct inbound data paths, each with its own review queue.** These are not synonyms and
should never be merged in UI language:

1. **Staging** — scraped/imported venues (`staging_venues`, `staging_happy_hour_windows`,
   `supabase/functions/import-places`), reviewed at `/admin/staging`, promotion resolves or creates
   an org. Enrichment via `npm run data:{enrich-venues,fetch-photos,fetch-covers,assign-placeholders}`.
2. **Intake** — field capture. An operator photographs a printed happy-hour board;
   `POST /api/intake/extract` runs a vision model (`INTAKE_VISION_PROVIDER` = `gemini` default,
   or `anthropic`) and returns a draft of windows + offers; `POST /api/intake/commit` writes windows,
   menus, and the `happy_hour_window_menus` join. Reviewed at `/admin/intake-review` and
   `/orgs/[orgId]/intake-review`. Admins uncapped; owners and Insiders get `INTAKE_DAILY_EXTRACT_CAP`
   scans per day.
3. **Suggestions** — user-submitted venues, reviewed at `/admin/suggestions`.

Plus `/admin/address-review` for Google-descriptor address parsing.

**Claim flow.** `/claim/[token]` is public and login-free — the opaque HMAC-signed token *is* the
authorization (`utils/intake-token.ts`, `v2 = menu`). The owner previews the draft menu and attached
windows and taps one Publish button, flipping the menu `draft → published`. Expired tokens return 410.

**Owner-facing preview.** `app-preview/orgs/[orgId]/venues/[venueId]` lets an owner see their own
consumer-side listing from inside the console.

**Physical/printed context is real.** QR assets are produced for print at 300 DPI with presets
`postcard`, `table_tent`, `coaster`, `sticker`, `digital`, capped at a 4" postcard (1200px)
(`packages/venue-qr`). Coaster onboarding is an active workstream. The URL printed on physical
collateral is `https://happitime.biz` (`QR_BASE_URL`), so that base is a durable commitment, not a
config detail.

**Issue tracking.** GitHub Issues are disabled. Findings and plans live as dated documents in
`docs/superpowers/specs/` (34 files) and `docs/superpowers/plans/` (33 files). `docs/index.md` is the
maintained master index.

## Capabilities and Constraints

### Confirmed functionality

- Org and venue management, member roles, venue assignments, org invites, access management.
- Happy-hour windows (`{dow: number[], start_time, end_time, label}`, status `draft|published`),
  happy-hour offers, menus / sections / items with an `is_happy_hour` flag.
- Vision-model field intake, staging promotion, suggestion and address review.
- Stripe billing: per-venue checkout, org bundle checkout, customer portal, webhook. Stripe-native
  promo codes.
- QR generation for venues and Insider referrals; check-in codes; check-in CSV export.
- Scan analytics; Toastmaker ratification; Insider referrals; contribution scoring; contributor
  leaderboard; redeemable rounds.
- Editorial guides with lifecycle `Draft → Pending Review → Published → Archived`; itineraries,
  including shared-by-link and save-a-copy.
- Admin CRM: leads, accounts, pipeline, tasks, CSV export.
- Auth: email/password with invite, recovery, forgot/reset/change password; Apple Sign-In on iOS;
  separate super-user login.

### Hard product constraints

- **Any write to `happy_hour_windows` asserts verification.** `touch_window_confirmed` (BEFORE) and
  `touch_venue_confirmed` (AFTER) fire on **every** insert or update: they set `last_confirmed_at` on
  the window, and set `last_confirmed_at` **and `listing_disputed = false` on the parent venue**.
  A cosmetic edit — typo fix, wording cleanup, backfill — therefore claims the listing was
  re-verified and silently resolves any open consumer-reported dispute. **Consequence for design:
  the console must not offer a plain "edit this text" affordance on a window as though it were
  cosmetic.** Any window-editing UI has to make the verification claim explicit, or route cosmetic
  changes through a path that does not touch the table. The window's own stamp cannot be corrected
  through PostgREST, because the corrective UPDATE re-fires the trigger. Open remediation:
  `docs/superpowers/specs/2026-08-19-happy-hour-label-content-model-design.md`.
- **Scraped venue data is never published as venue-confirmed without review.** This is the reason
  `/admin/staging`, `/admin/intake-review`, and `/admin/address-review` exist. Any flow that would
  let imported data reach `published` without a human step violates it.
- **Dispute resolution is service-role only.** Consumers insert `listing_reports` directly under RLS
  (one open report per user, venue, and type); nothing in the client may resolve one.
- **Schema changes go through migration PRs only**, append-only, no DDL in the dashboard SQL editor
  against prod. Drift is checked nightly against a clean migration replay.
- **Outbound email from `admin@happitime.biz` is draft-only.** *Stated operating rule, not a verified
  mechanism:* no enforcing code was found, and real send paths exist (`nodemailer` in the directory
  app, `supabase/functions/send-venue-digest`, which hardcodes `ADMIN_ALERT_EMAIL`). A past outage is
  documented in `EMAIL-OUTAGE-FINDINGS-2026-08-12.md`. Treat as policy to honor, and do not assume a
  guardrail will catch a violation.
- **Geographic scope is Kansas City metro only**, both Missouri and Kansas sides. Every consumer route
  is namespaced `/kc/`.
- `psql` is not installed and no DB connection string is checked in; `supabase db query --linked` is
  the path for prod SQL.

### Pricing (verified against code)

Per-venue tiers (`apps/web/src/utils/subscription-features.ts`,
`supabase/migrations/20260530210311_pricing_tiers_remodel.sql`):

| Tier | Price | Label |
|---|---|---|
| `listed` | free | Listed |
| `verified` | $49/mo | Verified |
| `featured` | $99/mo | Featured |
| `founding_pilot` | $49/mo | Founding Pilot |

Org bundles (`apps/web/src/utils/bundle.ts`): `bundle_2_4` = **$79/venue** (2–4 venues),
`bundle_5_plus` = **$59/venue** (5+). Ineligible below 2 venues. The public `/pricing` page agrees,
including JSON-LD Offers.

Feature gating, exact keys and labels:

- `photo_forward_layout` "Photo-forward layout" — Verified and above
- `menu_editing` "Self-serve menu editing" — Verified and above
- `top_of_category` "Top-of-category placement" — Featured only
- `push_notifications` "Push notifications" — Featured only
- `weekly_social_post` "Weekly social post" — Featured only

Listed grants the empty set.

Two facts not in `CLAUDE.md`:

- **`founding_pilot` is a live fifth tier** — $49 with the full Featured feature set
  ("time-limited offer granting featured-level capability at the verified price"), with a
  `founding_pilot_until` column on `venue_subscriptions` and a matching CRM `interested_tier`.
  Checkout bills the Verified product but grants Featured features. **Open decision: whether this
  offer is still commercially open, or only the code path survives.**
- **Featured carries a 30-day free trial** — "$0 today · $99/mo starting day 31 · cancel anytime";
  Stripe collects the card and charges $0, first $99 lands on day 31.

**On the obsolete tier:** do not quote a $79/mo "Premium" tier. The precise history is that
`premium` was **renamed** to `featured` at $99 (alongside `free` → `listed`, `basic` → `verified`).
$79 today is unrelated — it is the `bundle_2_4` per-venue rate. The legacy vocabulary survives only
in a superseded CHECK constraint in `20260423120000_venue_promotions.sql`.

### Terminology

Use the product's own words; several near-synonyms are **not** interchangeable.

- **Venue** — never "business" or "location". Status `draft|published|archived`.
- **Happy hour window** · **happy hour offer** · **menu / section / item**.
- **Organization / org** · **org member** · **venue member** · **venue assignment** · **org invite**.
- **Listing disputed** · **last confirmed at** · **listing freshness** (the consumer banner) ·
  **listing report**. The consumer entry point is the low-key link **"Something's off?"**, and the
  three report options are exactly **"Hours are wrong"**, **"Menu or prices are wrong"**,
  **"Deal wasn't honored"** — mirrored in the console.
- **HappiTime Insider** is the user-facing name; **`super_user`** is the DB role value. Different
  registers, not synonyms. **Super Admin** is the platform operator (`admin_users`).
- **Three separate attribution vocabularies — do not collapse them.** *Insider* = referral credit.
  *Toastmaker* = a venue's ratified top traffic-bringer, one per venue per calendar quarter
  (`YYYY-Q#`). *Contributor* / contribution scoring / contributor leaderboard = UGC credit.
- **Staging** vs **intake** vs **suggestions** — three different inbound paths, three different
  queues.
- **Guide** (editorial) · **itinerary** · **check-in** · **redeemable round**.
- **daycap** — KC-local term for a daytime happy hour; appears in public copy.
- **Console** = `apps/web`. **Directory** = `apps/directory`.
- DB columns: `promotion_tier`, `venue_subscriptions.plan`.

## Brand Commitments

- **Name**: `HappiTime` — one word, capital H and T. Always set as live type, never as a flat
  image. Note that the two-tone split is **not consistent across surfaces**: HTML copy breaks it
  `Happi` + brand-colored `Time`, while the `Logo.tsx` wordmark breaks it `Happ` + white `iTi` +
  `me` over a copper disc. Both are in use; neither has been retired. Pick deliberately rather than
  assuming one convention.
- **Primary domain**: `happitime.biz` (306 occurrences, vs 2 for `.app` and 1 for `.com`). This is
  not a `.com` product. The single `happitime.com` reference in `docs/super-user-role.md` is stale;
  `.biz` is canonical.
- **Console subdomain**: `console.happitime.biz`.
- **Printed QR base**: `https://happitime.biz` — physically printed on coasters and table tents.
- **Two logo artifacts exist, for two different media:**
  - **On-screen (canonical):** `apps/web/src/components/ui/Logo.tsx` — an inline SVG wordmark
    component on a 439×148 viewBox, default 28px tall. A `#C8965A` circle (r=47.9) sits behind
    letterforms set in Plus Jakarta Sans 800 at 72px with `-0.02em` tracking, split across three
    `tspan`s: `Happ` + `iTi` + `me`. The middle `iTi` is white, so it reads *out of* the copper
    disc. Two variants: `dark` (graphite `#1A1A1A` letterforms) and `light` (cream `#F5F0EB`),
    with the disc and the white `iTi` fixed in both. Carries `role="img"` and
    `aria-label="HappiTime"`.
  - **Printed / raster:** the "iTi" fragment alone as a 616×440 RGBA PNG, shipped base64 in
    `packages/venue-qr/iti-mark.mjs` and generated by `scripts/gen-iti-mark.mjs` (marked
    do-not-edit-by-hand). Painted at the center of every QR code, where raster is required.
- **There is no standalone `.svg` file, and no outlined-path version of the wordmark.** Both
  artifacts render the letterforms as *type*: `Logo.tsx` uses SVG `<text>` that depends on Plus
  Jakarta Sans 800 being loaded, and the PNG is a pre-rendered bitmap. **Consequence:** the
  wordmark will fall back to a substitute face anywhere the font is unavailable — email clients,
  third-party embeds, PDFs generated outside the console, a partner's deck. If a context needs the
  wordmark to be font-independent, an outlined SVG must be produced; one does not exist today.
- **Taglines in existing copy** (verbatim, do not invent new ones):
  - "Kansas City's Happy Hour Guide"
  - "HappiTime — Kansas City Happy Hour Deals, Live Right Now"
  - sub-line: "Browse deals by neighborhood. Save your favorites. Never miss a deal again."
- **Voice**: plainspoken and dual-audience, willing to address both sides in one breath — the home
  metadata runs "See which Kansas City happy hours are on right now, sorted by what ends soonest…
  Own a venue? See what it costs to fill your slow hours." The public home page is a two-door
  opener literally labeled "drinks" vs "pouring". Not promotional, not cute.

## Evidence on Hand

**Real, in-repo:**

- **Five hand-written editorial guide pages** with real published copy and FAQPage JSON-LD:
  `best-happy-hours-kansas-city`, `best-happy-hour-food-kansas-city`,
  `friday-happy-hours-kansas-city`, `power-and-light-happy-hour-guide`, `westport-happy-hour-guide`.
- **Real legal pages**: `/privacy`, `/terms` — both substantive, not stubs.
- **A real named sponsored event**: `/sponsored-events/social-life-brunch`, with three genuine
  photographs (`portrait.jpg`, `martini.jpg`, `frenchtoast.jpg`) — **the only real photography in the
  repository.**
- **A real neighborhood taxonomy** (`lib/seoNeighborhoods.ts`): Westport, Power & Light, Crossroads
  Arts District, Country Club Plaza, Downtown, River Market, Brookside, Waldo, 18th & Vine, Midtown,
  West Bottoms, North Kansas City, Northeast KC, KCK, Overland Park, Lee's Summit, Grandview.
- **A hand-written LLM-facing fact sheet** at `/llms.txt`.
- App store listing copy at `apps/mobile/store-metadata.md`; deep linking configured via
  `.well-known/apple-app-site-association` and `assetlinks.json`.

**Claims that are marketing copy, not data — do not present as verified:** `/llms.txt` asserts
"150+ bars and restaurants across 18+ Kansas City metro neighborhoods", "updated daily, sourced
directly from venues", and free availability on web, iPhone, and Android. No venue dataset in the
repo corroborates these; `supabase/seed.sql` is 136 lines of demo fixtures referencing Chicago.
Real venue rows exist only in the production Supabase project.

**Does not exist — never fabricate:**

- **No testimonials, no press or press kit, no "as seen in", no case studies, no customer quotes,
  no customer logos.** A case-insensitive search across app source, `docs/`, and all root markdown
  returned zero hits.
- **No standalone logo file and no outlined wordmark.** The two logo artifacts that do exist are
  described under Brand Commitments: an inline SVG component (`Logo.tsx`, font-dependent) and a
  base64 PNG of the "iTi" fragment for QR codes. There is no `.svg` asset, no outlined-path
  version, and no exportable logo package to hand a partner.
- **No brand illustrations, decorative imagery, textures, or patterns**, per the repo's own design
  audit.
- **No venue photography in-repo** — covers are user-submitted or fetched at runtime from Google
  Places / Unsplash.
- No benchmark figures, no conversion data, no named paying customers.

**Unverified claim to check before stating publicly:** a 24-hour content-moderation SLA
("We review reports and remove violating content within 24 hours") appears in
`docs/superpowers/plans/2026-09-07-social-feed-sp1-ugc-spine.md`. It lives in a *plan*; shipped
status is unconfirmed.

## Product Principles

1. **A confirmation is a human act with a timestamp.** The product's whole claim is that someone
   stood behind these hours on a date. Nothing in the console may assert confirmation as a
   side effect of an unrelated edit.
2. **Nothing scraped reaches the public as venue-confirmed without a human in the loop.** The three
   review queues are the product, not overhead.
3. **The operating team is a first-class user, not an afterthought.** The admin half is the
   daily driver; its density, speed, and keyboard ergonomics matter as much as owner polish.
4. **Prove the traffic, then charge for it.** Attribution — scans, check-ins, referrals, Toastmaker —
   is what makes a tier renewable. Billing surfaces should be adjacent to evidence of value.
5. **The console is one surface of a three-surface product.** Owner-facing screens should reflect
   what the consumer actually sees, which is why `app-preview` exists.

## Accessibility & Inclusion

**No accessibility standard is stated or enforced anywhere in the project, and none has been
established by the user.** Recording this as a known gap rather than inventing a commitment.

Current factual state:

- No WCAG or equivalent commitment in any document.
- No automated enforcement: both `apps/web/.eslintrc.json` and `apps/directory/.eslintrc.json` are
  only `{"extends": "next/core-web-vitals"}`, which does not enable `jsx-a11y`. `axe-core` and
  `eslint-plugin-jsx-a11y` exist in `node_modules` solely as transitive dependencies and are not
  configured.
- ARIA usage is incidental and sparse, concentrated in modals and labels.
- `prefers-reduced-motion` is honored in exactly three files, none of them in the console.
- **No skip link anywhere.**
- One known accessibility defect is already tracked in `BACKLOG.md` and `TODO.md`: `window.confirm()`
  blocks the main thread and is not accessible; it should be replaced with a focus-trapped modal
  (`ConfirmDeleteForm.tsx`).

Open decision: whether to adopt a target standard. Until the user sets one, treat WCAG 2.1 AA as a
reasonable default to *audit against* without claiming it as a product commitment.
