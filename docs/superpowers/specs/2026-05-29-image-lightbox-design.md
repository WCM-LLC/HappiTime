# Image Lightbox (tap-to-expand) — Design

**Date:** 2026-05-29
**Author:** Juan + Claude
**Status:** Approved (direction); pending spec review

## Goal

Let users tap/click an image to expand it to a full-screen view, then dismiss it
with a conspicuous **✕** in the corner (and other natural dismiss gestures). Applies
to the mobile app and the web surfaces.

## Hard constraint: mobile must ship via EAS OTA

The mobile implementation must be **pure JS/TS** — no new native modules, no config-plugin
changes, no new dependencies with native code. This rules out `react-native-gesture-handler`
and `react-native-reanimated`, and therefore rules out **pinch-to-zoom**. We use only
React Native core (`Modal`, `Image`, `FlatList`, `Pressable`) which is fully OTA-shippable.
Pinch-zoom is explicitly out of scope and would be a separate, native-rebuild feature later.

## Scope

| Surface | Images covered | Notes |
|---|---|---|
| `apps/mobile` | Venue / happy-hour photos | Hero carousel in `HappyHourDetailScreen.tsx`. **No guide screens exist in mobile**, so guides are out of scope on mobile. |
| `apps/directory` | Guide cover + guide content images; venue photos | Public site. Guide body via `react-markdown`; venue photo at `kc/[neighborhood]/[slug]/page.tsx`. |
| `apps/web` | Guide cover + content images (admin preview); app-preview venue photos; B2B console venue media | Guide preview at `admin/guides/[id]/preview/page.tsx`; venue photo at `app-preview/.../page.tsx`. |

Out of scope: avatars/profile images, menu images, pinch-to-zoom, captions, download/share.

## Interaction contract (both platforms)

1. Tap/click an in-scope image → opens a full-screen overlay with a dark backdrop; the
   image is shown **contained** (whole image visible, aspect preserved).
2. A conspicuous circular **✕** button sits in the top-right corner (safe-area aware on mobile).
3. Dismiss via: the ✕ button, tapping the backdrop, **Esc** (web), and the **Android back**
   button (mobile, via `Modal.onRequestClose`).
4. Open/close animates with a short fade.
5. While open on web, background page scroll is locked.

## Mobile design (`apps/mobile`)

### New component: `src/components/ImageLightbox.tsx`

Controlled component (parent owns visibility/state). Built on RN core only.

```
type ImageLightboxProps = {
  visible: boolean;
  images: string[];       // one or more image URIs
  initialIndex?: number;  // which image to show first (default 0)
  onClose: () => void;
};
```

- Root: `Modal` with `transparent`, `animationType="fade"`, `onRequestClose={onClose}`
  (handles Android hardware back).
- Backdrop: full-screen `Pressable` (near-opaque black, e.g. `rgba(0,0,0,0.92)`) whose
  `onPress` calls `onClose`.
- Image area: a horizontal **paging `FlatList`** of `Image` (`resizeMode="contain"`),
  starting at `initialIndex`, so the user can swipe between multiple venue photos —
  mirroring the existing hero carousel. (FlatList is RN core → OTA-safe.) Tapping the
  image (not just the backdrop) also closes.
- Close button: absolutely-positioned circular button in the top-right, inset by
  `useSafeAreaInsets().top`, containing a styled `✕` `Text` (no icon library is
  installed; matches the codebase's existing text/Pressable modal pattern such as
  `VisitRatingModal.tsx`). Hit slop for an easy tap target.
- Optional page dots reusing the existing hero-dot style when `images.length > 1`.

### Integration into `HappyHourDetailScreen.tsx`

- Add local state: `lightboxVisible` and reuse the existing `activeHeroIndex`.
- Wrap each hero `Image` (around line 296–303) in a `Pressable` whose `onPress` sets
  `lightboxVisible = true` (the lightbox opens at `activeHeroIndex`).
- Render `<ImageLightbox visible={lightboxVisible} images={heroImages}
  initialIndex={activeHeroIndex} onClose={() => setLightboxVisible(false)} />` near the
  end of the screen's tree.
- The existing horizontal hero `ScrollView` already tracks `activeHeroIndex` via
  `onMomentumScrollEnd`, so the lightbox opens on the photo currently in view.

## Web design (`apps/web` and `apps/directory`)

### Approach: event delegation (Option A)

A single client component wraps a region of an otherwise-server-rendered page and listens
for click events bubbling up from any `<img>` inside it. On an image click it reads the
image's `currentSrc`/`src` and opens a full-screen overlay. This covers `next/image` cover
images **and** `react-markdown` content images **and** plain venue `<img>` with one
component and minimal per-page edits.

### New component (duplicated identically in each app's `components/` dir)

`apps/web/src/components/ImageLightbox.tsx` and
`apps/directory/src/components/ImageLightbox.tsx`.

We duplicate the ~80-line client component rather than introduce a shared UI package,
consistent with how the two apps already duplicate small utilities
(`guideCoverUrl`/`guide-cover-url`). YAGNI.

```
"use client";
// <Lightbox>{children}</Lightbox>
```

Behavior:
- Renders `children` inside a wrapper `div` with an `onClick` handler. The handler checks
  `e.target` is an `HTMLImageElement` (and not inside an interactive element it shouldn't
  hijack); if so it calls `e.preventDefault()` and opens the overlay with that image's
  resolved source.
- When open, renders a `fixed inset-0 z-[100]` overlay: dark backdrop, the image centered
  with `object-contain max-h/max-w`, and a top-right circular **✕** button.
- Dismiss: ✕ click, backdrop click, and **Esc** key (`keydown` listener added while open).
- Body scroll lock: toggle `document.body.style.overflow = 'hidden'` via `useEffect` while open.
- Accessibility: overlay is a `role="dialog"` with `aria-modal`, the ✕ is a real `<button>`
  with `aria-label="Close image"`, and focus moves to the ✕ on open. Because delegated
  `<img>` elements aren't natively focusable, the wrapper adds `cursor-zoom-in` styling to
  signal interactivity; full keyboard-trigger of arbitrary images is a known limitation of
  the delegation approach and is acceptable for this scope.

### Integration points

- **Directory guide** (`apps/directory/src/app/guides/[slug]/page.tsx`): wrap the cover
  block + `<article className="prose ...">` (which contains the `react-markdown` output)
  with `<Lightbox>…</Lightbox>`.
- **Web admin guide preview** (`apps/web/src/app/admin/guides/[id]/preview/page.tsx`): wrap
  the cover block + the `prose` `<div>` containing `<ReactMarkdown>` with `<Lightbox>`.
- **Directory venue** (`apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx`): wrap the
  venue photo region (around the `<img>` at line ~423) with `<Lightbox>`.
- **Web app-preview venue** (`apps/web/src/app/app-preview/orgs/[orgId]/venues/[venueId]/page.tsx`):
  wrap the venue photo region (around the `<img>` at line ~227) with `<Lightbox>`.
- **B2B console venue media**: wrap the venue media display region similarly. The uploader
  control itself (`VenueMediaUploader.tsx`) is excluded so clicks on edit/remove controls
  are not hijacked — only the rendered preview images open the lightbox.

Server components can wrap server-rendered children with a client component via the
`children` prop, so no page needs to become a client component.

## Testing

- **Mobile:** Manual on iOS + Android — tap hero photo opens lightbox at the right index;
  swipe between photos; close via ✕, backdrop tap, and Android back; verify safe-area inset
  on a notched device. Confirm no new native dependency is added (the OTA gate).
- **Web:** Manual in `apps/directory` and `apps/web` — click a guide cover, a guide content
  image, and a venue photo; close via ✕, backdrop, and Esc; verify body scroll lock and that
  non-image clicks (links, buttons) are unaffected.
- A11y smoke check: ✕ is reachable and labeled; Esc closes; focus returns sensibly.

## OTA verification (mobile)

After implementation, confirm OTA-shippability before claiming done — **in this order**:
1. `git diff` touches only files under `apps/mobile/src/**` (JS/TS) — **no** changes to
   `app.json`/`app.config`, `ios/`, `android/`, `package.json` deps, or config plugins.
2. No new import of a native module.
3. **Run the app in a simulator and verify the lightbox end-to-end before pushing any OTA
   update.** Launch the Expo dev/simulator build (iOS Simulator and/or Android emulator),
   open a happy-hour detail screen, and confirm: tap-to-expand opens at the right photo,
   swipe between photos works, and all dismiss paths (✕, backdrop tap, Android back) work.
   This is a hard gate — do not publish the OTA update until the simulator run passes.
4. Only then ship via the existing EAS OTA update channel (the production OTA channel is
   already wired).

## Out of scope / future

- Pinch-to-zoom and pan (needs `gesture-handler` + `reanimated` → native rebuild).
- Captions, download, share, slideshow autoplay.
- Avatar/menu image expansion.
