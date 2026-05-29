# Image Lightbox (tap-to-expand) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users tap/click an image to expand it full-screen and dismiss it with a conspicuous ✕ (plus backdrop tap / Esc / Android back), on the mobile app and the web surfaces.

**Architecture:** Mobile uses a controlled `ImageLightbox` built only on React Native core (`Modal`, `Image`, `FlatList`, `Pressable`) so it ships via EAS OTA with zero native changes. Web uses a `"use client"` event-delegation `Lightbox` wrapper that catches clicks bubbling from any `<img>` and shows a fixed overlay; it is duplicated identically into `apps/web` and `apps/directory` (no shared package), matching how those apps already duplicate small utilities.

**Tech Stack:** React Native 0.81 (Expo SDK 54), Next.js 15 (App Router), TypeScript, Tailwind (web), `react-native-safe-area-context` (already installed).

**Testing note:** These apps have **no UI test harness** (no jest/RTL/vitest/playwright). Per the design spec, verification is `typecheck` + `lint` + manual simulator/browser checks. This plan therefore uses those as its verification steps instead of automated unit tests. Do not add a test framework — that is out of scope.

**Spec:** `docs/superpowers/specs/2026-05-29-image-lightbox-design.md`

---

## File Structure

**Mobile (`apps/mobile`):**
- Create: `src/components/ImageLightbox.tsx` — controlled full-screen image viewer (RN core only).
- Modify: `src/screens/HappyHourDetailScreen.tsx` — make hero photos tappable + render the lightbox.

**Web (`apps/web`):**
- Create: `src/components/ImageLightbox.tsx` — `"use client"` event-delegation overlay wrapper.
- Modify: `src/app/admin/guides/[id]/preview/page.tsx` — wrap cover + prose region.
- Modify: `src/app/app-preview/orgs/[orgId]/venues/[venueId]/page.tsx` — wrap venue photo region.
- Modify: the B2B console venue media display (located in Task 6).

**Web (`apps/directory`):**
- Create: `src/components/ImageLightbox.tsx` — identical copy of the web component.
- Modify: `src/app/guides/[slug]/page.tsx` — wrap cover + article region.
- Modify: `src/app/kc/[neighborhood]/[slug]/page.tsx` — wrap venue photo region.

---

## Task 1: Mobile `ImageLightbox` component

**Files:**
- Create: `apps/mobile/src/components/ImageLightbox.tsx`

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/components/ImageLightbox.tsx` with this exact content:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ImageLightboxProps = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
};

export function ImageLightbox({ visible, images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<string>>(null);
  const [width, setWidth] = useState(() => Dimensions.get('window').width);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Reset to the requested image each time the lightbox is opened.
  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(next, images.length - 1)));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={styles.backdrop}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {/* Tapping empty space closes. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close image" />

        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, index) => `${item}-${index}`}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item }) => (
            <Pressable style={[styles.page, { width }]} onPress={onClose}>
              <Image source={{ uri: item }} style={styles.image} resizeMode="contain" />
            </Pressable>
          )}
        />

        {images.length > 1 ? (
          <View style={[styles.dots, { bottom: insets.bottom + 24 }]} pointerEvents="none">
            {images.map((item, index) => (
              <View
                key={`${item}-dot`}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}

        <Pressable
          style={[styles.closeButton, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close image"
        >
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '600' },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff' },
});

export default ImageLightbox;
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS (no new errors introduced by this file; pre-existing errors elsewhere may remain — confirm none reference `ImageLightbox.tsx`).

- [ ] **Step 3: Lint the new file**

Run: `cd apps/mobile && npx eslint src/components/ImageLightbox.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/ImageLightbox.tsx
git commit -m "feat(mobile): add OTA-safe ImageLightbox component"
```

---

## Task 2: Wire the lightbox into `HappyHourDetailScreen`

**Files:**
- Modify: `apps/mobile/src/screens/HappyHourDetailScreen.tsx`

- [ ] **Step 1: Import the component**

Add to the imports near the top of the file (alongside the other component imports):

```tsx
import { ImageLightbox } from '../components/ImageLightbox';
```

- [ ] **Step 2: Add lightbox visibility state**

Find the existing `activeHeroIndex` state declaration. Immediately after it, add:

```tsx
const [lightboxVisible, setLightboxVisible] = useState(false);
```

(`useState` is already imported in this file.)

- [ ] **Step 3: Make hero photos tappable**

Replace the hero `Image` map (currently around lines 296–303) — the block that reads:

```tsx
{heroImages.map((url, index) => (
  <Image
    key={`${url}-${index}`}
    source={{ uri: url }}
    style={[styles.heroImage, { width: heroWidth }]}
    resizeMode="cover"
  />
))}
```

with:

```tsx
{heroImages.map((url, index) => (
  <Pressable
    key={`${url}-${index}`}
    onPress={() => setLightboxVisible(true)}
    accessibilityRole="imagebutton"
    accessibilityLabel="Expand photo"
  >
    <Image
      source={{ uri: url }}
      style={[styles.heroImage, { width: heroWidth }]}
      resizeMode="cover"
    />
  </Pressable>
))}
```

Ensure `Pressable` is in the `react-native` import list at the top of the file; if it is not already imported, add it.

- [ ] **Step 4: Render the lightbox**

Find the closing of the hero wrap `View` (the `</View>` that closes `styles.heroWrap`, after the hero dots block). Immediately after that closing `</View>`, add:

```tsx
<ImageLightbox
  visible={lightboxVisible}
  images={heroImages}
  initialIndex={activeHeroIndex}
  onClose={() => setLightboxVisible(false)}
/>
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS (no new errors referencing `HappyHourDetailScreen.tsx`).

- [ ] **Step 6: Lint**

Run: `cd apps/mobile && npx eslint src/screens/HappyHourDetailScreen.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/HappyHourDetailScreen.tsx
git commit -m "feat(mobile): open ImageLightbox from happy-hour hero photos"
```

---

## Task 3: Mobile simulator verification (OTA gate)

**Files:** none (verification only).

- [ ] **Step 1: Confirm no native changes were made**

Run: `git diff --name-only origin/master...HEAD -- apps/mobile`
Expected: only files under `apps/mobile/src/` appear. There must be **no** changes to `apps/mobile/app.json`, `app.config.*`, `ios/`, `android/`, `package.json`, or any config plugin. If any native file changed, stop — the change is not OTA-safe.

- [ ] **Step 2: Launch in a simulator**

Run: `cd apps/mobile && npm start`
Then press `i` for the iOS Simulator (and/or `a` for the Android emulator).
Expected: app boots in the simulator using the JS bundle (no native rebuild required).

- [ ] **Step 3: Manually verify the interaction**

Navigate to a happy-hour detail screen that has photos and confirm:
- Tapping a hero photo opens the full-screen lightbox on the photo currently in view.
- Swiping left/right pages between photos; the dots track the active photo.
- The ✕ button (top-right, below the notch/status bar) closes the lightbox.
- Tapping the dark backdrop closes it.
- The Android hardware back button closes it (Android emulator).
- A venue with a single photo shows no dots and still opens/closes correctly.

Expected: all pass. Only after this passes is the change cleared to ship via the existing EAS OTA update channel. **Do not publish the OTA update until this step passes.**

---

## Task 4: Web `ImageLightbox` component (`apps/web`)

**Files:**
- Create: `apps/web/src/components/ImageLightbox.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/ImageLightbox.tsx` with this exact content:

```tsx
'use client';

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';

type LightboxProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Wraps a region of the page and opens a full-screen overlay when any <img>
 * inside it is clicked (event delegation). Covers next/image, react-markdown
 * content images, and plain <img>. Pure client component; safe to wrap around
 * server-rendered children passed via `children`.
 */
export default function ImageLightbox({ children, className }: LightboxProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [alt, setAlt] = useState('');

  const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest('img');
    if (!img) return;
    // Don't hijack images that are inside a link or button.
    if (target.closest('a, button')) return;
    const resolved = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src;
    if (!resolved) return;
    e.preventDefault();
    setSrc(resolved);
    setAlt((img as HTMLImageElement).alt || '');
  }, []);

  const close = useCallback(() => setSrc(null), []);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, close]);

  return (
    <div className={className} onClick={handleClick}>
      {children}
      {src ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded image"
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
        >
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close image"
            autoFocus
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-2xl leading-none text-white hover:bg-black/80"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS (no new errors referencing `ImageLightbox.tsx`).

- [ ] **Step 3: Lint**

Run: `cd apps/web && npx next lint --file src/components/ImageLightbox.tsx`
Expected: no errors. (If `next lint` does not accept `--file`, run `cd apps/web && npm run lint` and confirm no new errors mention `ImageLightbox.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ImageLightbox.tsx
git commit -m "feat(web): add event-delegation ImageLightbox overlay"
```

---

## Task 5: Wire lightbox into `apps/web` guide preview + app-preview venue

**Files:**
- Modify: `apps/web/src/app/admin/guides/[id]/preview/page.tsx`
- Modify: `apps/web/src/app/app-preview/orgs/[orgId]/venues/[venueId]/page.tsx`

- [ ] **Step 1: Import in the guide preview page**

In `apps/web/src/app/admin/guides/[id]/preview/page.tsx`, add to the imports:

```tsx
import ImageLightbox from '@/components/ImageLightbox';
```

- [ ] **Step 2: Wrap the cover + prose region**

This page renders a cover block (using `next/image`, around line 134) and a prose `<div>` containing `<ReactMarkdown>` (around line 184). Wrap the JSX region that spans **both** the cover block and the prose `<div>` in `<ImageLightbox> … </ImageLightbox>`. For example, if both sit inside an existing container, change:

```tsx
<>
  {/* cover block */}
  <div className="prose prose-gray max-w-none">
    <ReactMarkdown>{guide.body_md ?? ''}</ReactMarkdown>
  </div>
</>
```

to:

```tsx
<ImageLightbox>
  {/* cover block */}
  <div className="prose prose-gray max-w-none">
    <ReactMarkdown>{guide.body_md ?? ''}</ReactMarkdown>
  </div>
</ImageLightbox>
```

Place the opening `<ImageLightbox>` just before the cover block and the closing `</ImageLightbox>` just after the prose `</div>`, keeping all existing JSX between them unchanged.

- [ ] **Step 3: Import + wrap in the app-preview venue page**

In `apps/web/src/app/app-preview/orgs/[orgId]/venues/[venueId]/page.tsx`, add the same import:

```tsx
import ImageLightbox from '@/components/ImageLightbox';
```

Then wrap the venue photo region (the `<img>` around line 227, and any sibling photos in that gallery block) with `<ImageLightbox> … </ImageLightbox>`. Wrap the smallest container that holds the venue photo(s), not the entire page, so unrelated UI is unaffected.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/guides/[id]/preview/page.tsx \
        apps/web/src/app/app-preview/orgs/[orgId]/venues/[venueId]/page.tsx
git commit -m "feat(web): expand guide and venue-preview images via lightbox"
```

---

## Task 6: Wire lightbox into the B2B console venue media display

**Files:**
- Modify: the page that renders a venue's saved media in the console (locate in Step 1).

- [ ] **Step 1: Locate the venue media display**

Run: `cd apps/web && grep -rn "VenueMediaUploader\|venue_media\|object-cover" src/app/orgs src/app/dashboard 2>/dev/null`
Identify the page/component that renders the venue's **saved** media images (the display/grid), as distinct from `VenueMediaUploader.tsx` (the upload control). If the only image rendering happens inside `VenueMediaUploader.tsx` itself, target the read-only preview `<img>`/`next/image` elements there.

- [ ] **Step 2: Import and wrap the display region**

Add `import ImageLightbox from '@/components/ImageLightbox';` to that file and wrap **only** the rendered media preview grid in `<ImageLightbox> … </ImageLightbox>`. Do **not** wrap the upload dropzone, the remove/reorder buttons, or any image that is itself a control — the component already ignores clicks inside `a`/`button`, but keep the wrap scoped to the preview images to be safe.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): expand console venue media previews via lightbox"
```

---

## Task 7: `ImageLightbox` component (`apps/directory`)

**Files:**
- Create: `apps/directory/src/components/ImageLightbox.tsx`

- [ ] **Step 1: Create the component**

Create `apps/directory/src/components/ImageLightbox.tsx` with the **exact same content** as defined in Task 4, Step 1 (the full `'use client'` component, identical line-for-line). The two apps intentionally keep their own copy.

- [ ] **Step 2: Typecheck**

Run: `cd apps/directory && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/directory/src/components/ImageLightbox.tsx
git commit -m "feat(directory): add event-delegation ImageLightbox overlay"
```

---

## Task 8: Wire lightbox into `apps/directory` guide + venue pages

**Files:**
- Modify: `apps/directory/src/app/guides/[slug]/page.tsx`
- Modify: `apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx`

- [ ] **Step 1: Import + wrap the guide page**

In `apps/directory/src/app/guides/[slug]/page.tsx`, add:

```tsx
import ImageLightbox from "@/components/ImageLightbox";
```

The page renders a cover block (`next/image`, around line 103) and `<article className="prose prose-gray max-w-none">` containing `<ReactMarkdown>` (around lines 142–143). Wrap the region spanning the cover block through the closing `</article>`:

```tsx
<ImageLightbox>
  {/* cover block ... */}
  <article className="prose prose-gray max-w-none">
    <ReactMarkdown>{guide.body_md ?? ""}</ReactMarkdown>
  </article>
</ImageLightbox>
```

Keep all existing JSX between the tags unchanged. Do **not** wrap the JSON-LD `<script>`/`dangerouslySetInnerHTML` breadcrumb block.

- [ ] **Step 2: Import + wrap the venue page**

In `apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx`, add the same import and wrap the venue photo region (the `<img className="w-full h-full object-cover">` around line 423, plus any sibling gallery photos) with `<ImageLightbox> … </ImageLightbox>`. Wrap the smallest container holding the photo(s).

- [ ] **Step 3: Typecheck**

Run: `cd apps/directory && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/directory/src/app/guides/[slug]/page.tsx \
        apps/directory/src/app/kc/[neighborhood]/[slug]/page.tsx
git commit -m "feat(directory): expand guide and venue images via lightbox"
```

---

## Task 9: Web browser verification

**Files:** none (verification only).

- [ ] **Step 1: Run the directory app**

Run: `cd apps/directory && npm run dev` (serves on port 3001).
Open a guide page (`/guides/<slug>`) and a venue page (`/kc/<neighborhood>/<slug>`).
Confirm:
- Clicking the guide **cover** image opens the overlay (contained, dark backdrop).
- Clicking an **inline content image** in the guide body opens the overlay.
- Clicking the **venue photo** opens the overlay.
- ✕ button, backdrop click, and **Esc** all close it.
- Background page scroll is locked while open and restored after close.
- Clicking links/buttons (e.g., a linked logo, the claim button) does **not** open the overlay.

- [ ] **Step 2: Run the web/console app**

Run: `cd apps/web && npm run dev`.
Open the admin guide preview (`/admin/guides/<id>/preview`), an app-preview venue page, and the console venue media view.
Confirm the same open/close behaviors as Step 1 for cover, content, venue-preview, and console media images, and that uploader controls still work normally.

- [ ] **Step 3: Final lint/typecheck sweep**

Run: `cd apps/web && npm run typecheck && cd ../directory && npm run typecheck`
Expected: PASS for both.

---

## Self-review notes

- **Spec coverage:** Mobile venue photos → Tasks 1–3. Web guide cover/content → Tasks 4–5 (web) and 7–8 (directory). Web venue photos → Tasks 5, 6, 8. OTA gate + simulator-test-before-push → Task 3. All in-scope surfaces map to a task.
- **Out of scope (per spec):** pinch-zoom, avatars, menu images, automated UI test framework — none added.
- **Type consistency:** Mobile prop type `ImageLightboxProps`/default-and-named export `ImageLightbox`; web default export `ImageLightbox` taking `{ children, className }`. Usage sites match these signatures.
