# Product

<!-- impeccable:product-schema 1 -->

Scope: this record covers **`apps/mobile`, the HappiTime consumer app** (Expo / React Native,
shipping to iOS and Android). `apps/android/App.tsx` is a verified one-line re-export of
`apps/mobile/App` with no source tree of its own, so this app is the single source for both
platforms.

Sibling surfaces are documented separately and only appear here as operating context:
`apps/web` (the owner/admin console, `console.happitime.biz`) and `apps/directory` (the public SEO
site, `happitime.biz`).

## Platform

adaptive

## Users

**Confirmed primary job: deciding where to go *right now*, with planning close behind.** The live
use case is the hook that gets the app opened; planning is what makes it worth keeping. The default
surface should serve immediacy and keep planning one tap away.

- **Guest.** Browsing requires no account, and that is a product commitment, not an oversight —
  the splash says so in as many words: *"Browsing is free. No account needed."* A guest lands on
  **Map** and sees three tabs (Map, Activity, Profile). Home and Favorites are deliberately omitted
  from the tab bar for guests.
- **Authenticated consumer.** Five tabs (Map, Home, Favorites, Activity, Profile) plus saving,
  itineraries, check-ins, history, and the social feed.
- **HappiTime Insider** (`user_profiles.role === 'super_user'`). Checked in exactly two places in
  the app. An Insider can: see **My Insider Code** on Profile (handle, referral link
  `happitime.biz/r/{handle}`, server-rendered QR, referral count, native share sheet); scan menus;
  have their public lists surface in the **From HappiTime Insiders** shelf, which a regular user's
  public list does not; and carry the ★ badge.
- **Venue-side intake user.** Exactly one venue-facing feature lives in the consumer app:
  **Scan a Happy Hour Menu**, gated by a server-side session check against three tiers
  (`admin | owner | super_user`). Publish-versus-draft is the server's call per venue
  (`can_publish`), never inferred client-side.

**Toastmaker is a status, not a role.** It is displayed read-only on the venue preview
(*"Toastmaker: @handle"* with a 🥂 badge) for the current quarter. There is no leaderboard, no
score display, and no way to see your own standing from inside the app.

**Signup is earned, never demanded.** Gated actions — save, follow, check in, build a list — open
a signup sheet and then **replay the original action** after auth. Anything that breaks that replay
breaks the activation model.

## Product Purpose

The consumer half of a happy-hour discovery marketplace for Kansas City. The app answers "what is
on right now, near me, and when does it end" and then gives a reason to come back.

**Confirmed stage: live on both the App Store and Google Play.** `ascAppId 6757933269`; bundle and
package are both `com.jwill7486.happitime.mobile`.

**Confirmed retention position: all four mechanisms are live and none has been designated primary.**
Those four are push when a deal starts, the check-in → Toastmaker → redeemable-rounds loop,
favourites and saved spots, and the social feed with Insiders. Recorded as an open prioritisation
rather than a hierarchy — future work should not assume a single engine, and should not invent one.

## Positioning

Freshness that a scraper cannot fake, carried to the phone. Every listing states when a human last
stood behind it and lets the crowd contest it:

- `ListingFreshness` reads `venues.last_confirmed_at` and `venues.listing_disputed`, with a
  **45-day** staleness threshold (`STALE_AFTER_DAYS = 45`).
- Fresh reads **"✓ Verified {Mon D}"**; stale and disputed both read
  **"Details may have changed — confirm with the venue"**.
- A low-key **"Something's off?"** link opens a three-tap report sheet. The component's own
  docstring states the rule: *never fake freshness.*

Second, the physical loop. A QR on a coaster or table tent leads to a venue page, a check-in earns
a stamp, stamps earn a round, and the venue gets a Toastmaker — which is what makes a paid tier
renewable to a GM.

## Operating Context

**Gate order at launch** (`App.tsx`): booting → guest pre-feed onboarding → post-signup onboarding →
handle gate → app. Two distinct onboarding flows exist and should not be conflated:

- **Pre-signup** (guest, shown once): Splash → Location prime → Vibe picker. Skippable. Vibe
  selections map to tags.
- **Post-signup** (9 steps, `ONBOARDING_VERSION = 1`):
  `welcome → location → preferences → notifications → handle → profile → referrer → checkin_prime → complete`.
  The version constant carries an explicit warning: **bumping it re-onboards every existing user.**

**Deep links are the entry point for the physical loop.** Scheme `happitime://`, universal links on
`happitime.biz` for `/i` (itinerary), `/r` (referral), `/v` (venue). Cold-start link capture runs
*above* the auth gate on purpose, so a QR scanned by a brand-new user is not dropped while the
welcome screen is showing.

**The app does not scan QR codes.** There is no camera or barcode scanning dependency for this.
QR codes are scanned by the operating system camera and arrive as universal links. Do not design a
flow that assumes an in-app scanner.

**Two surfaces, two jobs, one brand.** The console is where venues maintain truth; this app is
where consumers consume it. The same Supabase project backs both.

## Capabilities and Constraints

### Live capabilities

Discovery feed with cuisine, price and tag filters · map discovery (the guest landing tab) ·
favourites, history and itineraries · itinerary sharing by link and save-a-copy · pilot check-ins ·
redeemable rounds at ≥5 stamps · notifications inbox with unread badge · push · menu scanning ·
friends feed, discover feed, people search by handle, follow counts, friend suggestions ·
listing freshness and dispute reporting · events calendar including a "Happening Now" filter ·
invite-a-friend · Insider referral code.

**Absent from the app despite existing in the backend:** contribution scoring and the contributor
leaderboard. The RPCs and specs exist; the mobile client references none of them.

### Hard constraints

- **Portrait only and light only.** `orientation: "portrait"` and `userInterfaceStyle: "light"` are
  locked in `app.json`. **There is no dark mode anywhere in the app.** Both platform guidelines treat
  dark as a first-class appearance, so this is a deliberate standing exception, not an omission to
  quietly fix.
- **`supportsTablet: true`.** iPad layouts are in scope whether or not they have been designed.
- **OTA contract.** `runtimeVersion: { policy: "appVersion" }` with `version: "1.0.8"` — **a version
  bump breaks OTA compatibility with installed builds.** This is the central release constraint.
- **Expo Go cannot run this app.** A native dev build is required.
- **No offline layer of any kind.** No connectivity detection, no request queue, no cached-data
  layer. Every read is a live Supabase call; offline means empty states and errors. Do not design
  anything that implies graceful degradation.
- **Background location is a separate consent from foreground**, and the distinction is driven by
  store compliance:
  - Foreground (`user_preferences.location_enabled`) powers map centring, nearby lists, and the
    check-in geofence. Surfaced as **"Use current location"**.
  - Background (**"Visit reminders"**) powers proximity pings and auto check-in. Its consent is a
    **device-local** AsyncStorage flag, deliberately not a database column and deliberately not
    synced across devices.
  - **A prominent disclosure modal must appear before any background permission request.** Google
    Play requires it, and the Play submission records that screen in a demo video. **Removing or
    reordering it breaks the store submission.** Its copy is quoted verbatim in the design spec.
  - The app self-heals: if its flag says yes but the OS says denied, it resets the flag and explains
    why. The control of record is OS permission *and* app flag.
- **Background tracking parameters** (product constants, not tuning knobs to drift): auto check-in
  radius ~40 m, dwell-to-rating prompt at 30 minutes, proximity ping radius 2.5 mi, ping cooldown
  4 hours per venue, auto check-in cooldown 2 hours per venue.
- **Push throttling is server-side and the app must not assume it.** Daily cap of **4** pushes per
  user per America/Chicago day, quiet hours **22:00–09:00** Chicago, both overridable by edge-function
  secrets. **The inbox is never throttled** — inbox rows are the source of truth and are always
  written; only the push is suppressed. The app enforces none of this.
- **Menu scan cap: 10 per day** for owners and Insiders, admins uncapped, resetting at midnight.
  The app only displays the remaining count; the server enforces it.
- **Menu intake calls the console's `/api/intake/*` routes**, not Supabase, authenticating with the
  user's Supabase token as a bearer header — so roughly 400 lines of reviewed server logic are not
  maintained twice.
- **Camera capture is iOS-only today.** The Android manifest in the shipped build carries no camera
  permission, so the request can only ever return denied; Android users get the photo-library picker.
  `app.json` now declares the permission, so this resolves on the next native Android build. It is a
  temporary OTA accommodation, **not** a design decision.
- **Content rating 17+ / Mature 17+** (alcohol references) on both stores.

### Platform differences that are deliberate design

Recorded as `adaptive`, and these are the differences that earn the label:

1. **A native SwiftUI permission panel, iOS only** (`modules/happitime-ios-ui`), with three variants
   — location, notifications, settings. Android falls back to the React Native implementation, and
   so does an iOS JS-only build without the native module.
2. **Maps provider.** Android forces Google Maps with a custom style; iOS uses Apple Maps. This is
   the single largest visual divergence between the platforms and it is intentional.
3. **Apple Sign In** exists on iOS via a file-extension split and renders nothing on Android.
4. **Android notification channel** with its own vibration pattern; a no-op on iOS.
5. Store links, and platform telemetry on push tokens.

The remaining `Platform.OS` branches are incidental — mostly the standard keyboard-avoiding idiom
and small inset differences.

### Terminology

- Tabs: **Map · Home · Favorites · Activity · Profile**.
- Activity segments: **Notifications · Friends · Discover · People · Check Ins**.
- The Favorites tab is titled **"Saved"** with the subtitle *"Your go-to spots."*; its third segment
  is user-facing **"Itineraries"** even though the internal key is `lists`.
- **"From HappiTime Insiders"** — the Insider-authored itinerary shelf.
- **"Visit reminders"** — always the user-facing name for background location. Never "background
  location" in UI copy.
- **"Use current location"** — foreground location.
- **"Something's off?"** — the dispute entry point. The three report options are exactly
  **"Hours are wrong"**, **"Menu or prices are wrong"**, **"Deal wasn't honored"**.
- **"✓ Verified {date}"** — the fresh state.
- **"Toastmaker: @handle"**, **"My Insider Code"**, **"Scan a Happy Hour Menu"**,
  **"Happening Now"**, **"Events & Specials"**, **"Upcoming Events"**.

## Brand Commitments

- Name **HappiTime**, one word. Primary domain **happitime.biz**.
- Store subtitle **"Kansas City Happy Hour Guide"**; category Food & Drink / Lifestyle.
- Voice markers already shipped: *"Browsing is free. No account needed."*, *"Kansas City's happy
  hours, live."*, *"Built by locals, for locals."*, *"Find deals near me."*
- The palette is **shared with the console**, token for token: Golden Hour `#C8965A`, warm page
  `#FAFAF8`, graphite `#1A1A1A`, the wine/teal/navy extended set, borders and semantic bases all
  match `apps/web/src/app/globals.css` exactly.
- **No custom font families.** Type is system — San Francisco on iOS, Roboto on Android — by
  explicit design.
- App icon background is Golden Hour `#C8965A`; splash background is cream `#F5F0EB`.

## Evidence on Hand

**Real, in-repo:**

- `store-metadata.md` — complete App Store and Google Play listing copy: names, subtitle, category,
  rating, promotional text, two descriptions, keywords, privacy/support URLs, contact
  `admin@happitime.biz`.
- Three PNG assets: `icon.png`, `adaptive-icon.png`, `splash.png`.
- Design specs in `docs/superpowers/specs/` covering background-location consent and its disclosure
  gate, behaviour-first onboarding, redeemable rounds, the notifications inbox, the social discovery
  feed, Insider attribution, and QR scan confirmation.
- Unit tests for the visit-tracking gate and the venue active-tier read.

**Does not exist — do not fabricate:**

- **No screenshots at all** — no store screenshots, no `fastlane/`, no marketing imagery. The store
  listings have no visual assets in this repository.
- **No app preview video**, though the Play background-location declaration requires a demo video.
- **No seeded or demo data.**
- **No distinct adaptive icon** — `adaptive-icon.png` is byte-identical to `icon.png`, so there is
  no separately designed foreground layer.
- **No test IDs and no E2E harness.**

**Two documentation-drift items that are themselves constraints:**

1. **`store-metadata.md` describes a markedly simpler product than what ships.** It covers browse,
   search, map, favourites and live status, and mentions nothing about itineraries, check-ins,
   redeemable rounds, Insiders, the social feed, menu scanning, or the notifications inbox — all of
   which are live. Stale release-facing copy, and a real blocker on the next submission.
2. **`README.md` states `runtimeVersion` is "currently 1.0.3"; `app.json` says 1.0.8.** The README's
   OTA instructions are stale.

**Corrected here, because the codebase contradicts its own documentation:** there are **no SF
Symbols in the React Native layer.** `icon-symbol.tsx` is the only implementation, `expo-symbols` is
not a dependency, and every platform renders Material Icons — the SF Symbol strings are merely keys
into a mapping table, and the `weight` prop is accepted and discarded. The file's docstring claims
otherwise and is wrong. The only real SF Symbols in the product are the three inside the native
Swift panel.

## Product Principles

1. **Browsing is free, and signup is earned.** The guest path is a commitment. Signup is requested
   only when an action requires identity, and the action is replayed afterwards.
2. **Never fake freshness.** A listing states when a human last confirmed it, and the crowd can
   contest it. Nothing in the app may imply a listing is current when the data does not say so.
3. **Right now first, planning one tap away.** Immediacy earns the open; planning earns the
   reinstall.
4. **The physical loop is the product, not a feature.** Coaster to QR to venue page to check-in to
   reward is the path that proves traffic to venues, and it must survive a cold start by a brand-new
   user.
5. **Consent is explicit and reversible, and the store requires the disclosure before the prompt.**
   Background location is never silently bundled with foreground.

## Accessibility & Inclusion

**No accessibility standard is stated or enforced for this app, and none has been established by the
user.** Recording the measured state rather than inventing a commitment.

- 32 `accessibilityLabel` and 32 `accessibilityRole` props exist, but **the distribution is the
  finding**: they sit almost entirely in the newer pilot and compliance surfaces (check-in,
  redemption, onboarding, listing freshness). **The four highest-traffic screens — Home, Map,
  Favorites and Activity, roughly 5,850 lines between them — carry zero accessibility props.** The
  five bottom tabs have no accessibility labels.
- **Zero** `accessibilityHint`, `accessibilityValue`, `accessibilityElementsHidden`, or any use of
  `AccessibilityInfo`.
- **Reduce Motion is not handled anywhere.** Modal fade/slide transitions and pressed-state scale
  transforms are ungated. Both platform guidelines require honouring the system setting.
- **Dynamic Type / font scaling is active by default** — nothing sets `allowFontScaling={false}` —
  but it is nowhere capped and nowhere evidenced as tested. Fixed-height containers and the many
  one- and two-line clamps are the practical risk at large type sizes.
- The best-instrumented surface in the product is the native Swift panel, which gets roles and
  Dynamic Type largely for free.

**Known token gap with an accessibility consequence.** The mobile palette matches the console
exactly, but is missing the console's text-safe `-ink` variants and its `brand-hover` token. The web
tokens were restructured specifically because mid-tone semantic colours fail contrast as type, and
because white on Golden Hour measures 2.64:1. Mobile currently renders white on `colors.primary` in
several places — exactly the combination the console's tokens were changed to prevent.

Open decision: whether to adopt a target standard. Until one is set, treat WCAG 2.1 AA plus each
platform's own guidance as the bar to *audit* against rather than a commitment already made.
