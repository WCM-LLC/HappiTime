---
name: HappiTime Console
description: Venue management console for HappiTime — operator-first, warm-neutral, copper-accented.
colors:
  brand: "#C8965A"
  brand-dark: "#A67842"
  brand-light: "#E8D5BC"
  brand-subtle: "#F5EDE3"
  brand-dark-alt: "#8B6535"
  background: "#FAFAF8"
  surface: "#FFFFFF"
  cream: "#F5F0EB"
  dark: "#1A1A1A"
  dark-surface: "#242424"
  foreground: "#1A1A1A"
  muted: "#6B6B6B"
  muted-light: "#9CA3AF"
  dark-foreground: "#F5F5F3"
  dark-muted: "#A3A3A3"
  border: "#E8E8E5"
  border-strong: "#D1D1CD"
  border-focus: "#C8965A"
  success: "#2D8A56"
  success-light: "#ECFDF5"
  error: "#C43E3E"
  error-light: "#FEF2F2"
  warning: "#D4A843"
  warning-light: "#FFFBEB"
  wine: "#8C3A4B"
  teal: "#2A7B6F"
  navy: "#2E4A6E"
typography:
  wordmark:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.02em"
  display-xl:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  display-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  display-md:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  heading-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  heading-md:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  heading-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
  full: "999px"
spacing:
  "0": "0px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-default:
    backgroundColor: "{colors.dark}"
    textColor: "{colors.dark-foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-default-hover:
    backgroundColor: "rgba(26, 26, 26, 0.9)"
  button-brand:
    backgroundColor: "{colors.brand}"
    textColor: "#FFFFFF"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-brand-hover:
    backgroundColor: "{colors.brand-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.background}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "#FFFFFF"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  badge-default:
    backgroundColor: "{colors.dark}"
    textColor: "{colors.dark-foreground}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-brand:
    backgroundColor: "{colors.brand-subtle}"
    textColor: "{colors.brand-dark-alt}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-success:
    backgroundColor: "{colors.success-light}"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-error:
    backgroundColor: "{colors.error-light}"
    textColor: "{colors.error}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "40px"
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "8px 40px 8px 12px"
    height: "40px"
  table-head:
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    padding: "0 16px"
    height: "48px"
  table-cell:
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    padding: "16px"
---

# Design System: HappiTime Console

## Overview

**Creative North Star: "The Brass Rail"**

The brass rail is the polished metal fitting that runs the length of a good bar. It is warm, hard-wearing, and quietly expensive. Nobody photographs it, but every regular has a hand on it. That is the register this console works in: a warm-neutral room with real brass in it, built for people who are in it every day and need it to hold up.

The system is almost entirely warm neutrals — a bone-white page (`#FAFAF8`), white surfaces, and hairline borders — with exactly one metal in the room. Copper does the pointing. It marks what is active, what is focused, what the operator should touch next. Because the page is calm, a single copper element is unmissable; because copper is the only warm accent, two copper elements compete and three cancel out. Restraint here is not minimalism for its own sake, it is a signal-to-noise decision in a tool where a missed state means a venue goes stale.

Depth is tonal, not cast. Surfaces separate by value and by a 1px hairline, never by a drop shadow at rest. A shadow in this system means one thing: *this layer is detached from the page* — a modal, a popover, a dropdown. Controls themselves are tactile and confident: firm contrast, solid fills, unambiguous hover, generous 40px targets. The console does not whisper what it is doing; a mutating action always visibly reports that it was received.

**Key Characteristics:**
- Warm-neutral foundation; never pure white, never cool gray
- One metal in the room — copper (`#C8965A`, "Golden Hour") is the only accent that points
- Flat at rest; hairlines and tonal value do the separating
- Shadows mean detachment, not depth
- `10px` default radius; pills only for status, never for actions
- One typeface for all copy (Inter); the display face is wordmark-only
- Tactile, confident controls with a uniform `40px` control height
- Every mutating action must visibly acknowledge it was received

## Colors

A warm-neutral room with a single metal: bone-white paper, white surfaces, graphite text, and copper used as the scarcest and most deliberate ink in the system.

### Primary
- **Golden Hour** (`#C8965A`): The one metal. Primary actions, active states, focus rings, and the accent disc in the wordmark. Its scarcity is the entire mechanism — this is the color that means *act here*.
- **Golden Hour Deep** (`#A67842`): The hover state for copper fills. Only ever a response to the pointer, never a resting color.
- **Golden Hour Tint** (`#E8D5BC`): Defined but **currently unused in the console** (0 uses). Its intended role is a tinted border or brand-adjacent edge where a full copper border would shout. Available, not established.
- **Golden Hour Wash** (`#F5EDE3`): The warm placeholder. Avatar fills, image slots before a cover loads, and the fill behind brand-weight badges. This is also the third step of the depth stack.
- **Golden Hour Ink** (`#8B6535`): Copper as *text*. Exists because `#C8965A` on `#F5EDE3` does not carry enough contrast for small type; this is the legible pairing for a copper-tinted badge.

### Secondary
Sanctioned for categorical use, where one hue cannot carry distinct meanings. Not decoration, and not a second brand voice.

**All three are defined in `globals.css` but currently have zero uses in the console.** They were confirmed as a reserved palette rather than removed; the tier rule in Do's and Don'ts is their first sanctioned application. Treat them as available-and-approved, not as established patterns with precedent to follow.

- **Oxblood** (`#8C3A4B`): The deepest of the three; carries the most weight. In the consumer app this is the Insider ★ badge.
- **Verdigris** (`#2A7B6F`): The coolest and quietest; reads as a steady, non-urgent state.
- **Midnight Navy** (`#2E4A6E`): Institutional and plural; reads well for grouped or multi-venue concepts.

### Neutral
- **Bone** (`#FAFAF8`): The page. A warm off-white that keeps white cards legible as objects sitting *on* something.
- **Paper** (`#FFFFFF`): Surfaces. Cards, inputs, table bodies, modals.
- **Cream** (`#F5F0EB`): The wordmark's text color on dark grounds, and an alternate warm ground.
- **Graphite** (`#1A1A1A`): Body text, and the fill for the default high-emphasis button. Doing double duty as both ink and surface is deliberate — see The Two-Weight Rule.
- **Graphite Raised** (`#242424`): The one step above Graphite for stacked dark surfaces. Defined but currently unused in the console (0 uses).
- **Slate** (`#6B6B6B`): Secondary text, table headers, helper copy.
- **Ash** (`#9CA3AF`): Placeholders and inactive glyphs only. Never body copy.
- **Hairline** (`#E8E8E5`): Every border, divider, and table rule in the system. The hardest-working token in the file.
- **Hairline Strong** (`#D1D1CD`): The emphatic divider, for separating groups rather than rows.

### Semantic
Each pairs a saturated ink with a tinted ground; always used as a pair.

- **Confirmed Green** (`#2D8A56`) on **Confirmed Wash** (`#ECFDF5`): Success, published, verified-fresh.
- **Dispute Red** (`#C43E3E`) on **Dispute Wash** (`#FEF2F2`): Errors, destructive actions, disputed listings.
- **Pending Amber** (`#D4A843`) on **Pending Wash** (`#FFFBEB`): Awaiting review, draft, expiring.

### Named Rules

**The Golden Hour Rule.** One copper commitment per view. Copper marks the single most important action or the one active state — not every clickable thing. If two copper elements are visible at once, one of them is wrong. Its rarity is the point.

**The No Stock Palette Rule.** Never reach into Tailwind's default palette. `amber-500`, `violet-600`, `blue-600`, and raw hex literals like `bg-[#DBEAFE]` are all violations, even when they look close. Every color in a HappiTime surface comes from `globals.css`. If a needed color does not exist there, add the token first.

**The Two-Weight Rule.** Graphite (`#1A1A1A`) is both the body ink and the default button fill. That is intentional, and it means a dark button is the *neutral* high-emphasis action, while a copper button is the *branded* one. Use dark for "Manage", "Save", "Export"; use copper for the action that advances the product's core loop — confirm, claim, publish, upgrade.

**The Warm Stack Rule.** Backgrounds step warm, never cool: `#FAFAF8` page → `#FFFFFF` surface → `#F5EDE3` tinted inset. A cool gray anywhere in this stack reads as a bug.

## Typography

**Display Font:** Plus Jakarta Sans — **wordmark only**, loaded at weight 800 and nothing else
**Body Font:** Inter (with `ui-sans-serif`, `system-ui`, `-apple-system`, `sans-serif`)
**Label/Mono Font:** None. The system has no monospace face.

**Character:** This is a single-voice system wearing a badge. Inter does all the talking — headings, body, tables, labels, captions — and its neutrality is what lets a dense admin table stay readable at `0.875rem`. Plus Jakarta Sans exists for one job: the wordmark's heavier, more characterful letterforms with tight `-0.02em` tracking. Hierarchy comes from size and weight, not from a second typeface.

### Hierarchy

Scale is a named 10-step ramp, not a ratio. Weights are applied as utilities; the values below are the sanctioned defaults.

- **display-xl** (700, `3rem`/48px, line-height 1.1): The single largest statement on a page. Rare in the console.
- **display-lg** (700, `2.25rem`/36px, 1.15): Page titles on a venue or org dashboard.
- **display-md** (700, `1.75rem`/28px, 1.2): Section openers on dense pages.
- **heading-lg** (600, `1.5rem`/24px, 1.3): Card titles. The most common heading in the console.
- **heading-md** (600, `1.25rem`/20px, 1.3): Sub-sections and panel headers.
- **heading-sm** (600, `1rem`/16px, 1.4): Inline group labels; the smallest size that may still be a heading.
- **body-lg** (400, `1.125rem`/18px, 1.6): Lead paragraphs and emphasis copy.
- **body-md** (400, `1rem`/16px, 1.6): The document default, set on `<body>`.
- **body-sm** (400, `0.875rem`/14px, 1.5): **The console's real working size** — every control, table cell, and form field. Buttons, inputs, selects, and table text are all `body-sm`.
- **caption** (500, `0.75rem`/12px, 1.4): Badges, meta labels, timestamps. Carries weight 500 because 12px at 400 goes soft.

### Named Rules

**The Wordmark-Only Rule.** Plus Jakarta Sans is loaded at a single weight (800) for a single purpose. It belongs to the logo and to the `HAPPITIME` eyebrow on printed collateral. It must never set a heading, a button, or body copy. If a surface needs more typographic presence, reach for Inter at a heavier weight or a larger step — not for the display face.

**The Working-Size Rule.** Controls and data are `body-sm` (14px), not `body-md`. A console page is mostly table rows and form fields; sizing those at 16px costs roughly a fifth of the visible rows for no gain in legibility. `body-md` is for prose, and the console has very little prose.

## Layout

**Container.** Content is capped at `--width-content` (1100px), centered, with 24px side gutters. This single width is used 25 times across the app and is effectively the only container in the system. `--width-narrow` (720px) and `--width-wide` (1400px) are defined but currently unused — treat them as available, not established.

**Grid.** Layout is Tailwind grid, overwhelmingly at 1, 2, 3, or 4 columns (`grid-cols-2` is the most common, then `grid-cols-1`, `grid-cols-3`, `grid-cols-4`). Higher counts (5, 6, 8, 12) appear once each and are one-off local structures, not system patterns. The default responsive move is a column collapse: multi-column at `md`/`lg`, single column below.

**Spacing rhythm.** A numeric 4px-based scale (`1`=4px through `16`=64px), with the 8/16/24 steps carrying most of the weight. Card internals are a uniform 24px (`p-6`); control padding is 8px vertical and 16px horizontal; inline clusters sit at 12px gaps.

**Responsive behavior.** The console *is* responsive — `sm:` (59 uses), `lg:` (43), `md:` (31), `xl:` (5) — but it is authored desktop-down, which is correct for its primary user. No custom breakpoints are defined, so Tailwind v4 defaults apply: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px. The sparse `xl:` usage means the layout is tuned for laptop widths and does not specifically exploit very wide displays.

**Density.** Comfortable, not compact. A uniform 40px control height and 48px table header are the two measurements that set the console's rhythm; both are generous for an admin tool and should stay that way — this is a surface where a misclick has real consequences.

### Named Rules

**The 1100 Rule.** Content stops at 1100px. Full-bleed layouts are not part of this system; a table that wants more room gets horizontal scroll inside its container, not a wider page.

**The Collapse-Not-Reflow Rule.** Narrow viewports get fewer columns, not rearranged ones. Reading order is preserved from desktop to mobile.

## Elevation & Depth

**This system conveys depth tonally, not with shadows.** Surfaces separate by warm value — page `#FAFAF8`, surface `#FFFFFF`, tinted inset `#F5EDE3` — reinforced by a 1px `#E8E8E5` hairline. A card is a card because it is whiter than the page and has an edge, not because it floats.

Shadows carry exactly one meaning: **this layer is detached from the page.** Modals, popovers, dropdowns, and toasts cast; cards, panels, tables, and form groups do not.

This is a deliberate tightening of current practice. `shadow-sm` appears 93 times in the codebase, mostly on resting cards, against 5 uses of `shadow-md`, 1 of `shadow-lg`, and 0 of `shadow-xl`. That `shadow-sm`-on-resting-cards pattern is the legacy habit; the hairline already does the work, and new surfaces should omit it.

### Shadow Vocabulary

- **`shadow-sm`** (`0 1px 2px rgba(0,0,0,0.04)`): Legacy resting-card shadow. Harmless where it already exists; do not add it to new surfaces.
- **`shadow-md`** (`0 2px 8px rgba(0,0,0,0.06)`): Dropdowns, select menus, inline popovers.
- **`shadow-lg`** (`0 4px 16px rgba(0,0,0,0.08)`): Toasts and side panels.
- **`shadow-xl`** (`0 8px 32px rgba(0,0,0,0.10)`): Modal dialogs. Currently unused; this is its reserved purpose.

All four are low-opacity and vertically biased — diffuse ambient light from above, never a hard directional cast.

### Named Rules

**The Overlay-Only Rule.** If an element is part of the page, it has a hairline and no shadow. If it sits above the page, it has a shadow and needs no hairline. Nothing in this system has both.

## Shapes

The form language is softly squared — rounded enough to read as warm and modern, square enough to feel like a tool rather than a toy.

**Radius strategy.** `10px` (`rounded-md`) is the default and dominates with 250 uses: buttons, cards, panels, and most containers. `16px` (`rounded-lg`) is the large-surface step (130 uses) for modal cards and major panels. `999px` (`rounded-full`) is reserved for status and identity — badges, chips, avatars (85 uses). `6px` (`rounded-sm`) is the input radius and the small-button step but is lightly used (9 uses). `24px` (`rounded-xl`) is effectively unused (2 uses) and should be considered out of the system.

**Borders.** A single 1px `#E8E8E5` hairline is the system's universal edge — cards, inputs, selects, table rules, dividers. `#D1D1CD` is the one step up, for separating groups rather than rows. There are no 2px borders and no colored left-border accents; the latter is explicitly not a HappiTime pattern.

**Silhouette.** Rectangular containers with soft corners, horizontal rules, and pill-shaped status markers. No clipping, no angled edges, no decorative geometry. The one circular form in the system is the copper disc inside the wordmark.

### Named Rules

**The 10px Default Rule.** When in doubt, `rounded-md`. Reach for `rounded-lg` only when the surface is genuinely large, and never mix three radii within one composition.

**The Pill-Means-Status Rule.** `rounded-full` signals "this is a state, not a control." Badges and chips are pills; buttons are not. A pill-shaped button in the console reads as a consumer-app import and breaks the operator register.

## Components

All controls share a `40px` height and a `body-sm` (14px) type size. Transitions are color-only at `150ms` with `cubic-bezier(0.4, 0, 0.2, 1)`; nothing in the console lifts, scales, or bounces.

### Buttons

Seven variants, which is the system's widest variant set — the console genuinely needs this many levels of emphasis.

- **Shape:** Softly squared (`10px`); `6px` at `sm` size, `16px` at `lg`. Never a pill.
- **Default (dark):** Graphite fill (`#1A1A1A`) with near-white text (`#F5F5F3`), hover to 90% opacity. The neutral high-emphasis action — "Manage", "Save", "Export".
- **Brand (copper):** Golden Hour fill (`#C8965A`) with white text, hover to Golden Hour Deep (`#A67842`). Reserved for actions that advance the core loop: confirm, claim, publish, upgrade. One per view.
- **Secondary:** White surface, hairline border, graphite text; hover fills to the page color (`#FAFAF8`).
- **Outline:** Resolves to the same declarations as Secondary in the current implementation — hairline border, Paper fill, graphite text, hover to page color. Two names, one appearance.
- **Ghost:** No border or fill; hover fills to the page color. For low-stakes inline actions inside dense rows.
- **Destructive:** Dispute Red fill (`#C43E3E`), white text, hover to 90%. Irreversible actions only.
- **Link:** Copper text with a 4px underline offset, underline on hover. For navigation inside prose, not for actions.
- **Sizes:** `sm` 32px / `caption`, `default` 40px / `body-sm`, `lg` 48px / `body-md`, `icon` 40×40.
- **Hover / Focus:** Hover is a background-color shift only. Focus is a 2px copper outline at 2px offset — the same ring used everywhere in the system.
- **Icons:** Lucide React at `size-4` (16px), 8px gap, pointer-events disabled so the icon never eats the click.
- **Disabled:** 50% opacity with pointer events removed.

### Badges

- **Style:** Pill (`999px`), `caption` (12px) at weight 500, 10px horizontal padding.
- **Variants:** `default` (graphite fill), `brand` (Golden Hour Wash ground with Golden Hour Ink text), `secondary` (page-color fill, slate text, hairline), `success` / `error` / `warning` (semantic wash + ink pairs), `outline` (hairline only).
- **State:** Badges are read-only status markers. A badge is never a control; if it needs to be clickable, it is a chip or a button.

### Cards / Containers

- **Corner style:** `10px` (`rounded-md`).
- **Background:** Paper (`#FFFFFF`) on the Bone page.
- **Shadow strategy:** None at rest — see Elevation & Depth. The hairline is the edge.
- **Border:** 1px Hairline (`#E8E8E5`).
- **Internal padding:** 24px uniform (`p-6`), including header, content, and footer slots. Content and footer drop their top padding so the header's 24px is not doubled.
- **Anatomy:** Header (12px internal gap) → Title (`heading-lg`, 600, tight tracking) → Description (`body-sm`, slate) → Content → Footer.

### Inputs / Fields

- **Style:** Paper fill, 1px Hairline border, `6px` radius, 40px tall, 8px/12px padding, `body-sm` text.
- **Placeholder:** Ash (`#9CA3AF`) — placeholders only, never instructional copy.
- **Focus:** A 2px copper ring *and* a copper border shift. This is the one place in the system where the focus treatment doubles up, because a field's edge is its whole affordance.
- **Read-only:** Fills to the page color with slate text — visibly inert without the ambiguity of a disabled control.
- **Disabled:** 50% opacity, not-allowed cursor.
- **Select:** Identical to Input, plus an inline slate chevron SVG set as a background image at `right 12px center` with 40px right padding, and native appearance removed. The chevron is a data URI, not an icon component, so the control stays a native `<select>`.

### Navigation

**There is no navigation component.** Navigation is composed per page from `next/link` and `Button` primitives — no `Nav`, `Header`, or `Sidebar` component exists in the codebase. That is a true fact about this system, not an omission in this document.

The consequence is that header structure varies between the org dashboard, the venue detail page, and the admin console. Any future navigation work should start by extracting the shared pattern rather than adding a fourth variation. Until then, a new page should copy the header of the page it most resembles.

### Data Table (admin signature)

The console's highest-traffic surface. Its restraint is the design.

- **Container:** A relatively positioned wrapper with `overflow-auto`, so wide tables scroll inside the 1100px container rather than widening the page.
- **Type:** `body-sm` throughout; caption at the bottom.
- **Header:** 48px tall, left-aligned, weight 500, **slate text** — headers are quieter than the data they label.
- **Row:** 1px Hairline bottom border, with the last row's border removed. Hover tints to the page color at 50% opacity (`bg-background/50`) — a whisper, enough to track the eye across a wide row without flashing.
- **Cell:** 16px padding, middle-aligned. Checkbox cells drop their right padding.
- **Footer:** Top hairline, page-color fill, weight 500.

### Pending State Family (signature)

The console's most distinctive engineering-as-design decision: a three-part mechanism guaranteeing that a mutating action visibly reports it was received.

- **`SubmitButton`** swaps its label for a spinning `Loader2` at 16px with a 6px gap, sets `aria-busy`, and disables itself. In a form with several submit buttons, *all* are disabled but only the one whose action is actually running shows the spinner.
- **`PendingFieldset`** fades its entire group to 50% opacity over 150ms and blocks pointer events while in flight. It is a real `<fieldset disabled>` because that natively disables every control inside it. On a dense page a single button spinner is easy to miss; fading the whole group is unmissable.
- **`FormPending`** exists because `useFormStatus` only observes an *ancestor* `<form>`. This console deliberately renders empty `<form id=…>` elements and scatters their controls across table rows and cards via the `form` attribute, since a wrapping form would break the layout or nest illegally. Pending state is therefore published by a reporter rendered inside each detached form and read back by id through context.

### Wordmark

- **Form:** An inline SVG on a 439×148 viewBox, default 28px tall, width auto.
- **Construction:** A `#C8965A` circle (r=47.9) sits behind the letterforms; the text is set in Plus Jakarta Sans 800 at 72px with `-0.02em` tracking, split across three `tspan`s — `Happ` + `iTi` + `me`. The middle `iTi` is white, so it reads *out of* the copper disc.
- **Variants:** `dark` (graphite letterforms, for light grounds) and `light` (cream `#F5F0EB` letterforms, for dark grounds). The copper disc and the white `iTi` are fixed in both.
- **Accessibility:** Carries `role="img"` and `aria-label="HappiTime"`.
- **Single source:** `src/components/ui/Logo.tsx`. Import it. The wordmark previously existed as
  seven hand-copied inline SVGs across the console and the directory, and that duplication is
  exactly what let one of them drift to a different letter split. `apps/directory` has its own
  equivalent at `src/components/Logo.tsx`.

### Named Rules

**The One Wordmark Rule.** The wordmark ships from a component, never from pasted SVG. The split is
`Happ` + white `iTi` + `me` over the copper disc — the same split printed on the physical QR
coasters and table tents — and no surface gets a second interpretation of it.

### Toasts

Sonner, docked bottom-right, with rich colors and a close button. Transient confirmations only; anything the operator must act on belongs in the page, not in a toast.

## Do's and Don'ts

### Do:
- **Do** take every color from `globals.css`. If the color you need is not a token, add the token first.
- **Do** keep copper to one commitment per view. Copper means *act here*; a second copper element destroys the first one's meaning.
- **Do** use the dark button for neutral high-emphasis actions ("Save", "Manage", "Export") and the copper button only for core-loop actions (confirm, claim, publish, upgrade).
- **Do** separate surfaces with the 1px `#E8E8E5` hairline and a warm value step. It is enough.
- **Do** set controls and table data at `body-sm` (14px) and keep the 40px control height.
- **Do** use `rounded-md` (10px) by default, `rounded-lg` (16px) for genuinely large surfaces, and `rounded-full` only for status.
- **Do** give every mutating action a visible pending state — `SubmitButton` for the control, `PendingFieldset` for the group.
- **Do** use `FormPendingReporter` inside any `<form id=…>` whose controls live outside it, or its buttons will never show a spinner.
- **Do** keep the focus ring exactly as it is: 2px copper at 2px offset, everywhere, no exceptions.
- **Do** differentiate the five tiers with the reserved palette — copper for Verified, Oxblood (`#8C3A4B`) for Featured, Midnight Navy (`#2E4A6E`) for bundles, Verdigris (`#2A7B6F`) for Founding Pilot, neutral for Listed.
- **Do** collapse columns on narrow viewports rather than rearranging them.

### Don't:
- **Don't** use Tailwind's default palette. The current `border-amber-300`, `bg-amber-50`, `text-amber-700`, `bg-amber-500`, `border-violet-400`, `ring-violet-200`, `bg-violet-50`, `text-violet-700`, and `bg-violet-600` in `SubscriptionPanel.tsx` are all violations of this rule.
- **Don't** inline raw hex. `bg-[#DBEAFE] text-[#2563EB]` and `bg-[#EDE9FE] text-[#6D28D9]` in `AdminTables.tsx` are violations, and the stock blue in particular puts a cool color into a warm system.
- **Don't** let the same concept carry different colors on different screens. Verified currently reads copper in `SubscriptionPanel.tsx` and stock blue in `AdminTables.tsx`; Featured reads stock amber in one and copper in the other. One tier, one color, everywhere.
- **Don't** reference a token that does not exist. `text-brand-text` in `AdminTables.tsx` resolves to nothing — there is no `--color-brand-text` in `globals.css`.
- **Don't** add `shadow-sm` to new resting surfaces. The hairline is the edge; shadows mean detachment.
- **Don't** pair a shadow with a hairline on the same element.
- **Don't** set type in Plus Jakarta Sans. It is loaded at weight 800 for the wordmark and the printed `HAPPITIME` eyebrow only.
- **Don't** make a button a pill. `rounded-full` is for status markers; a pill button imports the consumer app's register into an operator tool.
- **Don't** introduce cool grays. Every neutral in this system is warm; `#FAFAF8` not `#FAFAFA`, `#6B6B6B` not `#6B7280`.
- **Don't** add scale, lift, or bounce on hover. Hover is a color shift at 150ms. The only motion in the system is the pending spinner and the pending fade.
- **Don't** use `rounded-xl` (24px). It appears twice and is not part of the system.
- **Don't** use colored left-border accents on cards. Explicitly not a HappiTime pattern.
- **Don't** put an actionable decision in a toast. Toasts are transient; operator decisions belong in the page.
- **Don't** re-inline the wordmark SVG. Import `Logo`. Seven pasted copies are why the splash page
  drifted to a different letter split.
