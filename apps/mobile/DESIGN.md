---
name: HappiTime Mobile
description: Kansas City happy hours, live — a consumer discovery app for iOS and Android.
colors:
  background: "#FAFAF8"
  surface: "#FFFFFF"
  cream: "#F5F0EB"
  text: "#1A1A1A"
  text-muted: "#6B6B6B"
  primary: "#C8965A"
  on-primary: "#1A1A1A"
  primary-dark: "#A67842"
  brand-subtle: "#F5EDE3"
  brand-light: "#E8D5BC"
  brand-dark: "#8B6535"
  wine: "#8C3A4B"
  wine-subtle: "#F4EBED"
  teal: "#2A7B6F"
  navy: "#2E4A6E"
  border: "#E8E8E5"
  border-strong: "#D1D1CD"
  success: "#2D8A56"
  success-light: "#ECFDF5"
  success-ink: "#246E45"
  error: "#C43E3E"
  error-light: "#FEF2F2"
  warning: "#D4A843"
  warning-light: "#FFFBEB"
  warning-ink: "#7F6528"
  pill-active-bg: "#1A1A1A"
  pill-active-text: "#FFFFFF"
  pill-inactive-bg: "#FFFFFF"
  pill-inactive-text: "#1A1A1A"
  input-background: "#F5F3F0"
  tab-bar-active: "#8B6535"
  tab-bar-inactive: "#6B6B6B"
  dark: "#1A1A1A"
  dark-surface: "#242424"
  dark-foreground: "#F5F5F3"
  dark-muted: "#A3A3A3"
typography:
  display-lg:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "32"
    fontWeight: 800
    lineHeight: 38
    letterSpacing: "-0.5"
  display-md:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "26"
    fontWeight: 700
    lineHeight: 32
    letterSpacing: "-0.3"
  display-sm:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "22"
    fontWeight: 700
    lineHeight: 28
    letterSpacing: "-0.2"
  heading-lg:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "20"
    fontWeight: 600
    lineHeight: 26
  heading-sm:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "17"
    fontWeight: 600
    lineHeight: 22
  body-md:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "15"
    fontWeight: 400
    lineHeight: 22
  body-sm:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "13"
    fontWeight: 400
    lineHeight: 18
  caption:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "11"
    fontWeight: 500
    lineHeight: 14
    letterSpacing: "0.2"
  label:
    fontFamily: "System (San Francisco on iOS, Roboto on Android)"
    fontSize: "13"
    fontWeight: 600
    lineHeight: 18
rounded:
  sm: "8"
  md: "12"
  card: "14"
  lg: "16"
  full: "999"
spacing:
  xs: "4"
  sm: "8"
  md: "12"
  lg: "16"
  xl: "24"
  xxl: "32"
  "3xl": "40"
  "4xl": "48"
components:
  tab-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tab-bar-inactive}"
    typography: "{typography.caption}"
  tab-bar-active:
    textColor: "{colors.tab-bar-active}"
  venue-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "12"
  chip-inactive:
    backgroundColor: "{colors.pill-inactive-bg}"
    textColor: "{colors.pill-inactive-text}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "6 12"
  chip-active:
    backgroundColor: "{colors.pill-active-bg}"
    textColor: "{colors.pill-active-text}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "6 12"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text}"
    typography: "{typography.heading-sm}"
    rounded: "{rounded.full}"
    height: "48"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.heading-sm}"
    rounded: "{rounded.full}"
    height: "48"
  input:
    backgroundColor: "{colors.input-background}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: "44"
  badge-brand:
    backgroundColor: "{colors.brand-subtle}"
    textColor: "{colors.brand-dark}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2 8"
---

# Design System: HappiTime Mobile

## Overview

**Creative North Star: "Golden Hour"**

Golden hour is the short window near the end of the day when the light is best. Everyone who has
chased it knows two things at once: it is beautiful, and it is about to be over. That is exactly
what this app is for — the happy hour that is on *now*, and ends at six.

The palette is already named for it. Golden Hour copper is the brand, and the app is warm the way
late light is warm: a bone-white ground, white cards, and copper used where attention should go.
Where the console is an operator's room, this is the street outside it at 5pm.

The character is **warm and glanceable at the same time**, and that tension is the design problem,
not a contradiction to be split. A venue card should feel inviting enough to want to go, and
readable enough to decide in two seconds on a sidewalk. The resolution is hierarchy: time and
distance are the fastest things on the card, the photography and the name carry the warmth, and
nothing decorative competes with either. If a card is pretty but you cannot tell when the deal ends,
it has failed; if it tells you everything and makes you want nothing, it has also failed.

Structure is the platform's, not ours. This app is recorded `adaptive`, and both HIGs govern
navigation, controls and depth in every mode. Brand lives in the layer the platform leaves open:
tint, type weight, motion, and content.

**Key Characteristics:**
- Warm-neutral ground, copper for attention — the same palette as the console, token for token
- Time is the fastest-read element on any surface that lists a deal
- System typeface by design: San Francisco on iOS, Roboto on Android, no custom family
- Platform-native structure and depth; brand in tint, type, motion and content
- Pills for status and filters; soft 14px cards
- Portrait only, light only — no dark mode exists
- Browsing never requires an account

## Colors

The palette is shared with the console **exactly** — every brand, neutral, extended and semantic
base matches `apps/web/src/app/globals.css`. The names below are the mobile token names.

### Primary
- **Golden Hour** (`#C8965A`, `colors.primary`): The one accent, and a **fill**. Primary action
  grounds, the Verified badge, map pins, heart fills. Also the app icon background and the Android
  notification accent. Never type on a light ground — see Golden Hour Ink.
- **Golden Hour Label** (`#1A1A1A`, `colors.onPrimary`): The label *on* a Golden Hour fill. Copper
  is a light fill, so its text is graphite at 6.60:1. White would be 2.64:1.
- **Golden Hour Deep** (`#A67842`, `colors.primaryDark`): Borders and boundaries on copper-adjacent
  grounds — the Verified card edge, the Toastmaker ring. A fill and border tone, not type
  (3.90:1 on Paper clears the 3:1 boundary floor, not the 4.5:1 text floor).
- **Golden Hour Tint** (`#E8D5BC`, `colors.brandLight`): Tinted borders and brand-adjacent edges.
- **Golden Hour Wash** (`#F5EDE3`, `colors.brandSubtle`): Avatar fills, image placeholders before a
  cover loads, and the ground behind brand-weight badges.
- **Golden Hour Ink** (`#8B6535`, `colors.brandDark`): Copper as *type or icon* on a light ground —
  5.24:1 on Paper, 5.01:1 on Bone, 4.51:1 on Golden Hour Wash. This is also the active tab tint.
  Reach for it whenever copper has to be read rather than filled.

On a dark ground the rule inverts: Golden Hour itself is 6.59:1 on Graphite and Golden Hour Ink is
only 3.32:1, so the few copper-on-dark controls stay on `colors.primary`.

### Secondary
Reserved categorical set, matching the console: **Oxblood** (`#8C3A4B`, `colors.wine`) with its
tint **Oxblood Wash** (`#F4EBED`, `colors.wineSubtle`), **Verdigris** (`#2A7B6F`), **Midnight Navy**
(`#2E4A6E`). Oxblood is the Insider ★ badge *and* the Featured tier. These are spoken for by
subscription tier and by Insider identity; do not reuse them for a third axis.

Verdigris and Midnight Navy carry no mobile tint, because `src/lib/venueTier.ts` collapses
Founding Pilot and both bundle sizes into "featured" — this surface shows two tier identities where
the console shows five.

### Tier identity
One declaration, `tierColors` in `src/theme/colors.ts`, mirroring the console's
`apps/web/src/utils/tier-style.ts`:

| Tier | Ground | Border | Badge | Badge label |
|---|---|---|---|---|
| Verified | Golden Hour Wash | Golden Hour Deep | Golden Hour | Graphite (6.60:1) |
| Featured | Oxblood Wash | Oxblood | Oxblood | Paper (7.44:1) |

`promotion_tier` is one database field rendered under one set of labels on both surfaces, so a
venue that bought Featured must not be Oxblood in the console and copper in the app. It was, until
2026-10-07, and Verified was a stock blue that appears nowhere in this palette.

### Neutral
- **Bone** (`#FAFAF8`) the app ground · **Paper** (`#FFFFFF`) cards, sheets, tab bar ·
  **Cream** (`#F5F0EB`) the splash ground and alternate warm surface
- **Graphite** (`#1A1A1A`) body text, the active pill fill, and the label on a copper fill ·
  **Slate** (`#6B6B6B`) secondary text, input placeholders, secondary glyphs, and the unselected tab
- **Hairline** (`#E8E8E5`) every border and divider · **Hairline Strong** (`#D1D1CD`)
- **Warm Field** (`#F5F3F0`) the input ground. This one has no console equivalent — it is slightly
  warmer than Bone and exists so a field reads as inset rather than as another card.

**Two text greys, not three.** There was an **Ash** (`#9CA3AF`) under Slate, carrying ten text
styles, thirteen input placeholders and five glyphs at **2.43:1** — under the floor for text *and*
under the floor for an informational icon, so it was unusable in every role it was being used for.
Darkening it enough to pass would have landed it within a hair of Slate and left two
indistinguishable greys pretending to be a hierarchy, so it was removed. There was also an
**Inactive Tint** (`#B5B0A8`) for the unselected tab at **2.16:1**; the tab bar is on every screen,
which made it the least readable thing in the app. Both now resolve to Slate.

### Semantic
**Confirmed Green** (`#2D8A56`, `colors.success`) on `#ECFDF5` · **Dispute Red** (`#C43E3E`) on
`#FEF2F2` · **Pending Amber** (`#D4A843`) on `#FFFBEB`.

The mid tones are fills, icons and borders — not type. **Confirmed Ink** (`#246E45`,
`colors.successInk`) and **Pending Ink** (`#7F6528`, `colors.warningInk`) are the text on those
grounds, at 5.88:1 and 5.34:1, because the mid tones measure 4.08:1 and 2.14:1 there. Dispute Red
needs no ink: it is 5.11:1 on Paper. These match the console's `-ink` variants exactly.

### Named Rules

**The Golden Hour Rule.** Copper marks where attention goes — the active tab, the primary action,
the live deal. One copper commitment per screen. Its scarcity is what makes a live happy hour
findable at a glance.

**The Warm Gray Rule.** Every *ground* and *border* here is warm: `#FAFAF8` not `#FAFAFA`,
`#F5F0EB`, `#F5F3F0`, `#E8E8E5`, `#D1D1CD`. The two text greys are neutral (`#1A1A1A`, `#6B6B6B`)
and shared with the console, which is the stronger constraint where they conflict.

The rule used to read "every neutral here is warm", which was never true of either text grey — and
the one token that was genuinely **cool**, Ash `#9CA3AF`, was sitting in the palette in breach of
it. Removing Ash for being unreadable also made this rule honest. A cool gray introduced anywhere
else still reads as a foreign component.

**The Shared Palette Rule.** These values are the console's values. A colour that changes here and
not there is drift, not a mobile decision — change both or neither.

## Typography

**Face:** the system font, deliberately. San Francisco on iOS, Roboto on Android. **There is no
custom font family anywhere in the app**, and that is a design decision rather than an omission: it
is what lets type inherit each platform's metrics and the user's reading size for free.

**Character:** the scale is the console's scale re-cut for the hand — tighter line heights, a lower
floor, and negative tracking on the display sizes. Weight carries hierarchy, not family.

### Hierarchy

- **display-lg** (800, 32/38, -0.5): the one big statement on a screen. Rare.
- **display-md** (700, 26/32, -0.3): screen titles.
- **display-sm** (700, 22/28, -0.2): section openers.
- **heading-lg** (600, 20/26): card titles and sheet headers.
- **heading-sm** (600, 17/22): the most common heading; also the button label size.
- **body-md** (400, 15/22): the working body size.
- **body-sm** (400, 13/18): secondary and supporting copy.
- **caption** (500, 11/14, +0.2): tab labels, meta, timestamps. 11 is the floor.
- **label** (600, 13/18): chips, pills and small emphasis.

### Named Rules

**The System Face Rule.** No custom font families. The brand is carried by colour, weight and voice.
Adding a display face would cost Dynamic Type and platform metrics for a gain the brand does not
need.

**The Scaling Rule.** Type scales with the user's system setting, everywhere, because nothing sets
`allowFontScaling={false}`. Any layout that cannot survive a large type setting is the layout's
problem, not the user's. Fixed heights and one-line clamps are where this breaks first.

## Layout

**Navigation.** Bottom tabs — Map, Home, Favorites, Activity, Profile — with **Home and Favorites
omitted for guests**, so a guest sees three. Tab height is `56 + bottom safe-area inset`, so it
adapts by device rather than by OS. Stack screens for hierarchy; the invite flow is a modal
presentation.

**Spacing.** A named 4px-based scale: `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · 3xl 40 · 4xl 48`.
Screen gutters are 16; card internals 12.

**Safe areas are structural, not decoration.** Insets drive the tab bar and every bottom-anchored
control. Nothing sits under the notch, Dynamic Island or home indicator on iOS, and Android is
edge-to-edge with window insets.

**Portrait only.** `orientation: "portrait"` is locked. There is no landscape layout to design.

**iPad is in scope.** `supportsTablet: true` ships, so phone layouts stretched to a 12.9" canvas are
a real state whether or not they have been designed for. Treat that as an open gap, not a solved one.

### Named Rules

**The Ending Soonest Rule.** On any surface that lists a deal, the time it ends is the fastest thing
to read. Not the venue name, not the photo. The whole product is "what is on right now", and the
layout has to answer that before anything else.

## Elevation & Depth

**Depth is platform-native.** This is the clearest expression of the `adaptive` call.

- **iOS:** flat at rest. Surfaces separate by warm value and a hairline, with shadows reserved for
  genuinely detached layers — sheets, modals, the floating map controls. This matches the console's
  model and the HIG's preference for grouped, flat surfaces.
- **Android:** Material tonal elevation. Elevation levels already in use are 1, 2, 3, 4, 6 and 8,
  with 3 the most common; depth reads as a tonal surface change plus the platform's own shadow, not
  as a hand-rolled drop shadow.

Two shadow tokens exist for the iOS side: **shadowSoft** `rgba(26,26,26,0.06)` and **shadowMedium**
`rgba(26,26,26,0.12)`. Both are warm-tinted — they are built from Graphite, not from pure black, so
a shadow on the Bone ground stays in the same warm family as everything else.

### Named Rules

**The Platform Depth Rule.** Do not ship one depth model to both platforms. An iOS screen that
leans on Material elevation looks like a port, and an Android screen with hand-rolled iOS shadows
looks like one too. Depth is the layer where the adaptive call is most visible to a fluent user.

## Shapes

Softly rounded, more generous than the console — this is a touch surface held at arm's length, and
larger radii read as friendlier at that distance.

**Radius scale, derived from use:** `999` dominates (pills, chips, avatars, primary buttons), then
**12** for small surfaces and inputs, **14** for the venue card — the signature radius of this app —
then 16 for larger panels and 8 for tight elements.

**Borders.** A single 1px Hairline, as on the console. No 2px borders, no colored left-border
accents.

**Silhouette.** Rounded rectangles and full pills. The copper disc in the wordmark and circular
avatars are the only true circles.

### Named Rules

**The Pill Rule.** `999` means "this is a state or a filter" — chips, badges, tab pills — **and also
the primary button**, which is the one place mobile deliberately diverges from the console, where
pills are forbidden on actions. A full-radius primary button is native-feeling on a phone and alien
in an operator console; both are correct for their surface.

**The Fourteen Rule.** The venue card is 14. It is the most-repeated shape in the product and the
one a user sees hundreds of times; keep it consistent rather than drifting between 12, 14 and 16 on
adjacent screens.

## Components

### Tab bar
Five destinations for an authenticated user, three for a guest. Paper ground, hairline top border,
Golden Hour Ink active tint, Slate inactive. Labels always shown, at 10pt — the smallest type in
the app, which is why both tints have to clear the text floor rather than the icon floor. Activity
carries an unread badge capped at "99+", and its accessible name states the count ("Activity, 3
unread") because the badge otherwise announces a bare number. Height is `56 + safe-area inset`.

**Open: selection is signalled by tint alone.** `tabBarIcon` passes
`weight={focused ? "semibold" : "regular"}`, but `components/ui/icon-symbol.tsx` accepts `weight`
and discards it, and every tab uses a `.fill` glyph in both states. So the only difference between
selected and unselected is colour. The fix is a filled/outlined glyph pair per tab, which
MaterialIcons does not supply for all five (no `home-outline`, no `map-outline`), so it needs
either a second icon family or the `expo-symbols` move below.

### Venue card
The product's signature component. Paper on Bone, 14px radius, 12px internal padding, photography
when a cover exists and a Golden Hour Wash placeholder when it does not. Must answer *what is on*
and *when it ends* before anything else.

### Filter chips
Full pills. **Active:** Graphite fill, white label. **Inactive:** Paper fill, Graphite label, 1px
hairline. The same two-state treatment as the console's filter chips.

### Buttons
Full-radius, 48pt tall — above both platforms' minimums (44pt iOS, 48dp Android). **Primary:**
Golden Hour fill. **Secondary:** Paper with a hairline.

### Inputs
Warm Field ground (`#F5F3F0`), 12px radius, 44pt tall, Ash placeholder. The inset ground is what
distinguishes a field from a card.

### Listing freshness
The trust component, and the one with the strictest rules. Reads `last_confirmed_at` and
`listing_disputed` against a 45-day threshold. Fresh shows **"✓ Verified {Mon D}"**; stale and
disputed both show **"Details may have changed — confirm with the venue"**. A quiet
**"Something's off?"** link opens a three-tap report sheet. **Never fake freshness** — no visual
treatment may imply a listing is current when the data does not say so.

### Insider badge
A wine-coloured ★ circle with the accessible name "HappiTime Insider". Oxblood is reserved for this
and for the Featured tier; it is not a general accent. The Toastmaker variant is a 🥂 on a Golden
Hour Wash ground inside a Golden Hour Deep ring — both tokens, where it previously carried two raw
hex values (`#F9F2E7`, `#C0773A`) that each sat a few points off an existing token.

### Native permission panel (iOS only)
A SwiftUI card used for the location, notifications and settings education moments. **It uses iOS
semantic colours and no HappiTime palette at all** — deliberately. It is the one surface that should
look like the operating system rather than like the brand, because it is asking for the system's
permission.

## Do's and Don'ts

### Do:
- **Do** answer "what is on and when does it end" before anything else on a deal surface.
- **Do** keep copper to one commitment per screen.
- **Do** let type scale with the system setting, and design layouts that survive it.
- **Do** use each platform's own depth model — flat and hairlined on iOS, tonal elevation on Android.
- **Do** keep the venue card at 14px radius everywhere it appears.
- **Do** use full pills for chips, badges and primary buttons on this surface.
- **Do** take colour from `src/theme/colors.ts`. If a value is not there, add it there.
- **Do** keep every neutral warm.
- **Do** call background location **"Visit reminders"** in UI copy, never "background location".
- **Do** let people browse without an account, and replay a gated action after signup.

### Don't:
- **Don't** use stock palette values. `#8B5CF6`, `#7C3AED`, `#60A5FA` and `#2563EB` were in
  `colors.ts` under `promoPremium*` and `promoBasic*` until 2026-10-07 — off-system, and carrying a
  tier name (`Premium`) that CLAUDE.md says not to quote. Tier colour now comes from `tierColors`
  and nowhere else. `test/mobile-palette-contrast.test.mjs` fails if those names are declared again.
- **Don't** put white text on Golden Hour: **2.64:1**. The label on a copper fill is
  `colors.onPrimary`, and copper that has to be *read* is `colors.brandDark`. Guarded by test.
- **Don't** set small text in a semantic mid tone. `success` and `warning` are fills, icons and
  borders; `successInk` and `warningInk` are the type. Guarded by test.
- **Don't** reach for a raw hex. If a value is not in `colors.ts`, add it there with its measured
  contrast against the ground it will sit on. The one standing exception is
  `screens/onboarding/LocationPrimeScreen.tsx`, whose `#DDE1EC`/`#C8CDD8` draw a stylised map
  illustration rather than UI, and the Google Maps style JSON in `utils/mapViewProps.ts`.
- **Don't** add a custom font family.
- **Don't** ship one depth model to both platforms.
- **Don't** introduce a cool gray.
- **Don't** assume an in-app QR scanner exists — QR codes are read by the OS camera and arrive as
  universal links.
- **Don't** design for dark mode. `userInterfaceStyle` is locked to light; a dark variant is a
  product decision that has not been made.
- **Don't** design for landscape. Portrait is locked.
- **Don't** imply offline capability. There is no offline layer; offline is empty states and errors.
