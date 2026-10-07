/**
 * HappiTime — Design System palette
 * Synced with Claude Design system (colors_and_type.css).
 *
 * Primary: Golden Hour (#C8965A)
 * Background: Warm white (#FAFAF8)
 * Foreground: Rich dark (#1A1A1A)
 */

export const colors = {
  /* ── Backgrounds ── */
  background: "#FAFAF8",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  cream: "#F5F0EB",

  /* ── Text ── */
  /* Two tiers, not three. There used to be a `textMutedLight` (#9CA3AF) sitting
     under these, used for 10 text styles, 13 input placeholders and 5 icons —
     at 2.43:1 on the background it failed the 4.5:1 floor for text AND the
     3:1 floor for an informational icon, so it was not usable in any of the
     roles it was being used for. Darkening it enough to pass would have put it
     within a hair of `textMuted` and left two near-identical tokens pretending
     to be a hierarchy, so it was removed and its call sites now use textMuted.
     `inputPlaceholder` held the same hex and went the same way. */
  text: "#1A1A1A",
  textMuted: "#6B6B6B",

  /* ── Brand / Primary ── */
  /* Copper is a LIGHT FILL. It is not a text colour: #C8965A on white is
     2.64:1, which fails the 4.5:1 floor for text and the 3:1 floor for an
     informational icon. The console reached the same conclusion and resolved it
     the same way (see apps/web/src/app/globals.css), so the two surfaces agree:

       primary     a fill. Its label is `onPrimary`, never white.
       onPrimary   graphite, 6.60:1 on primary. White would be 2.64:1.
       brandDark   copper AS TYPE on a light ground — 5.24:1 on white,
                   4.51:1 on brandSubtle. This is the one to reach for when
                   copper needs to be read rather than filled.
       primaryDark a mid tone for borders and fills only — 3.90:1 on white
                   clears the 3:1 UI floor but not the 4.5:1 text floor. */
  primary: "#C8965A",
  onPrimary: "#1A1A1A",
  primaryDark: "#A67842",
  accent: "#C8965A",

  /* ── Brand subtle (for avatars, tinted backgrounds) ── */
  brandSubtle: "#F5EDE3",
  brandLight: "#E8D5BC",
  brandDark: "#8B6535",

  /* ── Extended palette ── */
  /* Reserved for categorical use. `wineSubtle` is the only tint carried over
     from the console so far, because Featured is the only tier that needs one —
     see `tierColors` below. The bases are fills and borders, not type. */
  wine: "#8C3A4B",
  wineSubtle: "#F4EBED",
  teal: "#2A7B6F",
  navy: "#2E4A6E",

  /* ── Borders ── */
  border: "#E8E8E5",
  borderStrong: "#D1D1CD",

  /* ── Semantic ── */
  /* `-light` is the badge ground, the mid tone is a fill or an icon, and
     `-ink` is the text on the ground. The mid tones are not type: `success` on
     `successLight` is 4.08:1 and `warning` on `warningLight` is 2.14:1, and
     both pairings were in use. The ink variants measure 5.88:1 and 5.34:1.
     `error` needs no ink — it is 5.11:1 on surface already. Same values and
     same reasoning as the console, so a status badge reads the same on both. */
  success: "#2D8A56",
  successLight: "#ECFDF5",
  successInk: "#246E45",
  error: "#C43E3E",
  errorLight: "#FEF2F2",
  warning: "#D4A843",
  warningLight: "#FFFBEB",
  warningInk: "#7F6528",

  /* ── Pills / Chips ── */
  pillActiveBg: "#1A1A1A",
  pillActiveText: "#FFFFFF",
  pillInactiveBg: "#FFFFFF",
  pillInactiveText: "#1A1A1A",

  /* ── Inputs ── */
  inputBackground: "#F5F3F0",
  inputBorder: "#E8E8E5",

  /* ── Tab Bar ── */
  /* These tint the 10px tab labels as well as the icons, so both have to clear
     the text floor against the white tab bar. The active tint was `primary`
     (2.64:1) and the inactive was #B5B0A8 (2.16:1) — the one row of controls
     visible on every screen was the least readable thing in the app. */
  tabBarBackground: "#FFFFFF",
  tabBarBorder: "#E8E8E5",
  tabBarActiveTint: "#8B6535",
  tabBarInactiveTint: "#6B6B6B",

  /* ── Dark surface (for dark buttons, dark cards) ── */
  dark: "#1A1A1A",
  darkSurface: "#242424",
  darkForeground: "#F5F5F3",
  darkMuted: "#A3A3A3",

  /* ── Shadows ── */
  shadowSoft: "rgba(26, 26, 26, 0.06)",
  shadowMedium: "rgba(26, 26, 26, 0.12)",
};

/**
 * Tier identity colours — one declaration, matching the console.
 *
 * This replaces nine `promo*` tokens that got the tiers wrong in two ways.
 *
 * The hues disagreed with the console. `promotion_tier` is one field with one
 * set of labels (src/lib/venueTier.ts turns it into "Featured"/"Verified", the
 * same words the console shows), but a venue that bought Featured rendered
 * COPPER here and OXBLOOD in the console, and Verified rendered a stock blue
 * (#2563EB/#60A5FA/#EFF6FF) that exists nowhere in the design system — with a
 * comment in HomeScreen conceding it "reuses the blue secondary-promo palette".
 * The console's apps/web/src/utils/tier-style.ts is the source of truth for
 * what a paid tier looks like, because that is where owners buy it and admins
 * manage it. So Verified is Golden Hour and Featured is Oxblood, here too.
 *
 * And three of the nine named a tier that does not exist: `promoPremium*` was
 * the obsolete $79 "Premium" plan, which CLAUDE.md says not to quote. It was
 * dead code holding a violet that had never shipped.
 *
 * Mobile collapses founding_pilot and both bundle sizes into "featured"
 * (venueTier.ts, guarded by test/venue-tier.test.mjs), so only two entries are
 * needed. The console keeps Verdigris and Midnight Navy for the tiers this
 * surface does not distinguish.
 *
 * `badgeText` is per tier rather than a shared white, because the two grounds
 * need opposite labels: white on wine is 7.44:1, white on copper is 2.64:1.
 */
export const tierColors = {
  featured: {
    bg: colors.wineSubtle,
    border: colors.wine,
    badge: colors.wine,
    badgeText: colors.surface, // white on wine — 7.44:1
  },
  verified: {
    bg: colors.brandSubtle,
    // primaryDark, not primary: copper on its own tint is 2.27:1, under the 3:1
    // floor for a UI boundary, where primaryDark is 3.36:1. Featured needs no
    // such step — wine on wineSubtle is already 6.36:1.
    border: colors.primaryDark,
    badge: colors.primary,
    badgeText: colors.onPrimary, // graphite on copper — 6.60:1
  },
} as const;
