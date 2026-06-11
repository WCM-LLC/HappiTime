# HappiTime Design System

## Overview

**HappiTime** is a free app that helps you find the best happy hour deals in Kansas City. Browse by neighborhood, see what's on special right now, save your favorite spots, and never miss a deal. Built by locals, for locals.

### Products
| Product | Stack | Audience |
|---|---|---|
| **Mobile App** | React Native / Expo | Consumers (iOS + Android) |
| **Web Dashboard** | Next.js 16, Tailwind v4, shadcn/ui | Venue owners & admins |
| **Directory** | Next.js | Public web presence (early) |

### Sources
- **Brand sheet:** `uploads/brand-sheet.html` — logo system, palette, app icons
- **Codebase:** GitHub `jwilliamslb86/HappiTime` (master branch) — monorepo at `happitime-monorepo`
  - Mobile: `apps/mobile/` — Expo app, theme at `src/theme/`
  - Web: `apps/web/` — Next.js, tokens in `src/app/globals.css`
  - Directory: `apps/directory/` — minimal, early stage
- **No Figma link provided**

---

## CONTENT FUNDAMENTALS

### Tone & Voice
- **Friendly, local, and direct.** Speaks like a knowledgeable KC local who knows all the spots.
- **Second person:** "Find the best deals," "Save your go-to spots," "Never miss a deal again."
- **Plural first-person for the brand:** "We keep our listings accurate." "Built by locals, for locals."
- **Short, punchy sentences.** No fluff. One idea per sentence.
- **No Oxford comma** implied in store copy.
- **Sentence case** for UI labels and body copy; **Title Case** for section headings.
- **Minimal emoji.** Emoji used only in Google Play descriptions (🍻 📍 ❤️ ⏰) — never in the app UI itself.
- **No exclamation marks** in UI. Store copy uses them sparingly.
- **Numbers are specific:** "New venues added weekly!" not "New venues added often."

### Copy Examples
- App subtitle: *"Kansas City Happy Hour Guide"*
- Discover page: *"Find happy hours happening today."*
- Empty state: *"No matches yet — try another cuisine or price tier."*
- Save CTA: *"Saved to your Favorites."*
- Tab labels: Discover, Map, Favorites, Activity, Profile
- Error state: *"We could not find this happy hour window."*
- Loading: *"Loading nearby happy hours for you…"*

### Casing
- Navigation labels: Title Case (`Kansas City`, `Venue Login`)
- Buttons: Title Case (`Get the App`, `Let's Go!`, `Add to Itinerary`)
- Body text: Sentence case
- Filter chips: Title Case (`All`, `Food`, `Drinks`)
- Meta labels (muted, tiny): UPPERCASE + wide tracking (`CUISINE`, `PRICE`)

---

## VISUAL FOUNDATIONS

### Colors
**Primary / Brand:** Warm copper/amber `#C8965A` (called "Golden Hour") — used for CTAs, active states, map pins, heart fills, tab bar active tint, focus rings.

| Token | Value | Usage |
|---|---|---|
| `brand` | `#C8965A` | Primary buttons, active icons, focus |
| `brand-dark` | `#A67842` | Hover state on brand buttons |
| `brand-light` | `#E8D5BC` | Tinted borders, brand accents |
| `brand-subtle` | `#F5EDE3` | Avatar bg, tinted card backgrounds |
| `dark` | `#1A1A1A` | Near-black; default/secondary buttons, text |
| `background` | `#FAFAF8` | App background (warm white) |
| `surface` | `#FFFFFF` | Card backgrounds, inputs |
| `cream` | `#F5F0EB` | Dark mode text, alternate background |
| `muted` | `#6B6B6B` | Secondary text |
| `muted-light` | `#9CA3AF` | Placeholder, inactive icons |
| `border` | `#E8E8E5` | All borders, hairlines |
| `wine` | `#8C3A4B` | Accent (logo color split, secondary brand) |

**Semantic:** `success: #2D8A56`, `error: #C43E3E`, `warning: #D4A843` — each with a light bg variant.

### Typography
- **Logo / wordmark:** Plus Jakarta Sans 800 — letter-spacing: -0.02em
- **Web app body:** Inter — all weights (400–700)
- **Mobile:** System UI — SF Pro on iOS, Roboto on Android (no custom fonts)
- **Scale:** display-xl (48px) → display-lg (36px) → display-md (28px) → heading-lg (24px) → heading-md (20px) → heading-sm (16px) → body-lg (18px) → body-md (16px) → body-sm (14px) → caption (12px)
- **Display weights:** 700–800 with tight negative letter-spacing (-0.3 to -0.5)
- **Body weights:** 400 (regular), 500 (medium), 600 (semibold)

### Spacing
Scale: `xs:4px`, `sm:8px`, `md:12px`, `lg:16px`, `xl:24px`, `xxl:32px`, `3xl:40px`, `4xl:48px`

### Backgrounds & Surfaces
- **Background:** `#FAFAF8` warm white — never pure white or cool-gray
- **Surface:** `#FFFFFF` cards, inputs, modals
- **No gradients** in UI (brand sheet uses none; no gradient backgrounds anywhere)
- **No full-bleed images** as backgrounds — photography used inside card heroes only
- **Brand-subtle** (`#F5EDE3`) used as placeholder hero / avatar fill before images load

### Cards
- **Radius:** 14px (mobile cards), 10–16px (web cards/panels)
- **Border:** `1px solid #E8E8E5` (hairline in mobile, `border-border` in web)
- **Shadow:** very subtle — `0 2px 8px rgba(0,0,0,0.06)` to `0 4px 16px rgba(0,0,0,0.08)`
- **No colored left-border accents** — not a HappiTime pattern
- **Card hover (web):** shadow step-up (`shadow-sm` → `shadow-md`), `transition-shadow`

### Buttons
- **Primary/brand:** `#C8965A` fill, white text, `border-radius: 999px` (full pill on mobile), `border-radius: 6–10px` on web
- **Dark/default:** `#1A1A1A` fill, `#FAFAF8` text — used for "Manage", high-emphasis web actions
- **Secondary/outline:** white/surface bg, `border: 1px solid #E8E8E5`, dark text
- **Ghost:** no border, hover shows `bg-background`
- **Link:** brand color, underline on hover
- **Destructive:** `#C43E3E` fill

### Interactions & Animation
- **Press state (mobile):** `opacity: 0.9` + `transform: scale(0.98)` — quick, tactile
- **Heart fill press:** `opacity: 0.6` + `scale(1.15)` — springy
- **Hover (web):** opacity or background shift only. No scale on web.
- **Transition duration:** 150ms (fast), 200ms (normal), 300ms (slow)
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` — standard Material-like ease
- **No bounce/spring animations** apparent in codebase
- **Modals:** `animationType="slide"` (bottom sheets), `animationType="fade"` (overlays)

### Border Radius System
| Token | Value | Use |
|---|---|---|
| `radius-sm` | 6px | Web inputs, small badges |
| `radius-md` | 10px | Web cards, panels |
| `radius-lg` | 16px | Web large cards, modal cards |
| `radius-xl` | 24px | Large surfaces |
| `radius-full` | 999px | Pills, chips, avatars, mobile buttons |
| 14px (mobile) | — | Mobile cards, map container, hero card |

### Shadows
`shadow-sm: 0 1px 2px rgba(0,0,0,0.04)` → `shadow-md: 0 2px 8px rgba(0,0,0,0.06)` → `shadow-lg: 0 4px 16px rgba(0,0,0,0.08)` → `shadow-xl: 0 8px 32px rgba(0,0,0,0.10)`
Shadows use very low opacity — refined, not dramatic.

### Filter Chips / Pills
- **Active:** dark fill (`#1A1A1A`) + white text
- **Inactive:** white/background fill + dark text + `1px solid border`
- `border-radius: 999px` always

### Focus & Accessibility
Focus ring: `outline: 2px solid #C8965A` with `outline-offset: 2px` — brand color used consistently.

### Imagery & Color
- Photography only inside venue hero cards (user-submitted covers)
- No brand illustrations or decorative imagery found
- No texture/patterns in the codebase
- Brand-subtle `#F5EDE3` used as warm placeholder when no image

### Tab Bar (Mobile)
- Background: `#FFFFFF`, border-top: `1px solid #E8E5E0`
- Active tint: `#C8965A` (brand copper)
- Inactive tint: `#B5B0A8` (warm gray)

### Dark Mode
- Dark surface: `#1A1A1A` / `#242424`
- Dark text: `#F5F5F3`
- Dark muted: `#A3A3A3`
- Logo uses cream `#F5F0EB` text on dark backgrounds

---

## ICONOGRAPHY

### Mobile (SF Symbols via Expo IconSymbol)
The mobile app uses **SF Symbols** exclusively, accessed via `apps/mobile/components/ui/icon-symbol.tsx`. This means icons are native SF Symbols on iOS (vector, weight-adaptive) and mapped to MaterialIcons on Android.

Icons used: `heart`, `heart.fill`, `star.fill`, `mappin.circle.fill`, `arrow.up.left.and.arrow.down.right`

### Web (Lucide React)
The web app uses **Lucide React** (`lucide-react`), added as a dependency in `apps/web/package.json`. Lucide is a stroke-weight 2, rounded-cap icon system.

### General
- No custom icon font or SVG sprite found in the codebase
- No emoji used as icons in any UI
- No PNG icon assets in the design (all programmatic)
- Unicode `&#9881;` (⚙) used once as a decorative empty-state glyph in the web dashboard

---

## FILE INDEX

```
README.md               — This file
SKILL.md                — Agent skill descriptor
colors_and_type.css     — CSS variables for colors, typography, spacing

assets/
  logo-light.html       — Logo rendering (light bg)
  logo-dark.html        — Logo rendering (dark bg)
  app-icon-gold.html    — App icon variants
  brand-palette.html    — Color swatches reference

preview/                — Design System tab cards
  colors-brand.html
  colors-neutral.html
  colors-semantic.html
  type-display.html
  type-body.html
  type-logo.html
  spacing-tokens.html
  spacing-radii.html
  shadows.html
  components-buttons-web.html
  components-buttons-mobile.html
  components-badges.html
  components-cards-web.html
  components-inputs.html
  components-chips.html
  components-mobile-card.html
  brand-logo.html
  brand-appicon.html

ui_kits/
  mobile/
    README.md
    index.html          — Mobile app prototype (Discover → Detail → Favorites → Profile)
  web/
    README.md
    index.html          — Web dashboard prototype (Login → Dashboard → Venue)
```
