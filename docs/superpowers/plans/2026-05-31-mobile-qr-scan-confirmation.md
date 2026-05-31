# In-App QR Scan Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the app opens from a venue QR scan (`happitime://venue/{slug}?src=qr`), route to the venue screen and show a one-shot "✓ Checked in!" banner.

**Architecture:** A pure URL parser (`parseVenueLink`) + an `expo-linking` hook (`useVenueDeepLink`) that mirrors the existing `useNotificationNavigation`/`useMagicLinkListener` pattern: catch the deep link (cold start + foreground), resolve slug→venueId via Supabase, and `navigate("VenuePreview", { venueId, fromScan })`. The venue screen shows a display-only banner — no second `track-visit` call, because the web bridge already recorded the scan.

**Tech Stack:** React Native (Expo SDK 54), `expo-linking`, React Navigation (native-stack), Supabase JS, `node:test` (type-stripped `.ts` import on Node 24).

**Spec:** `docs/superpowers/specs/2026-05-31-mobile-qr-scan-confirmation-design.md`

---

## File Structure

- **Create** `apps/mobile/src/lib/parseVenueLink.ts` — pure, RN-free parser (`happitime://venue/{slug}` + `https://…/v/{slug}` → `{ slug, src }`). The only unit-tested unit.
- **Create** `test/parse-venue-link.test.mjs` — node:test for the parser.
- **Create** `apps/mobile/src/hooks/useVenueDeepLink.ts` — listener + slug→venueId resolve + navigate.
- **Modify** `apps/mobile/src/navigation/types.ts` — add `fromScan?: boolean` to `VenuePreview` params.
- **Modify** `apps/mobile/src/navigation/AppNavigator.tsx` — mount `useVenueDeepLink(navigationRef)`.
- **Modify** `apps/mobile/src/screens/VenuePreviewScreen.tsx` — one-shot "✓ Checked in!" banner.

---

## Task 1: Pure `parseVenueLink` + unit tests

**Files:**
- Create: `apps/mobile/src/lib/parseVenueLink.ts`
- Test: `test/parse-venue-link.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/parse-venue-link.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseVenueLink } from "../apps/mobile/src/lib/parseVenueLink.ts";

test("parses the custom-scheme venue link with src", () => {
  assert.deepEqual(parseVenueLink("happitime://venue/sea-capitan?src=qr"), {
    slug: "sea-capitan",
    src: "qr",
  });
});

test("parses the https landing form the same way", () => {
  assert.deepEqual(parseVenueLink("https://happitime.biz/v/sea-capitan?src=qr"), {
    slug: "sea-capitan",
    src: "qr",
  });
});

test("url-decodes the slug", () => {
  assert.deepEqual(parseVenueLink("happitime://venue/a%20b?src=qr"), { slug: "a b", src: "qr" });
});

test("returns src=null when the param is absent", () => {
  assert.deepEqual(parseVenueLink("happitime://venue/sea-capitan"), {
    slug: "sea-capitan",
    src: null,
  });
});

test("ignores non-venue deep links (auth)", () => {
  assert.equal(parseVenueLink("happitime://auth/callback?code=x"), null);
});

test("returns null when the slug is missing", () => {
  assert.equal(parseVenueLink("happitime://venue/"), null);
});

test("returns null for non-string input", () => {
  assert.equal(parseVenueLink(undefined), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/parse-venue-link.test.mjs`
Expected: FAIL — `Cannot find module …/parseVenueLink.ts` (file not created yet).

- [ ] **Step 3: Write the parser**

Create `apps/mobile/src/lib/parseVenueLink.ts`:

```ts
// src/lib/parseVenueLink.ts
//
// Pure parser for venue deep links. No React/RN imports, so it is unit-testable
// under `node --test` (Node 24 strips the type annotations). Matches the custom
// scheme the web bridge emits (happitime://venue/{slug}?src=qr) and the https
// landing form (https://happitime.biz/v/{slug}?src=qr). Returns null for any
// non-venue URL (e.g. happitime://auth/...) so the auth listener is unaffected.

export type ParsedVenueLink = { slug: string; src: string | null };

export function parseVenueLink(url: unknown): ParsedVenueLink | null {
  if (typeof url !== "string") return null;
  const [base, rest = ""] = url.split("?");
  const match =
    base.match(/^happitime:\/\/venue\/([^/?#]+)/i) ||
    base.match(/^https?:\/\/[^/]+\/v\/([^/?#]+)/i);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    slug = match[1];
  }
  if (!slug) return null;
  const query = rest.split("#")[0];
  const src = new URLSearchParams(query).get("src");
  return { slug, src: src ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/parse-venue-link.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: PASS — existing suites plus the 7 new parser tests.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/parseVenueLink.ts test/parse-venue-link.test.mjs
git commit -m "feat(mobile-qr): pure parseVenueLink for venue deep links"
```

---

## Task 2: `useVenueDeepLink` hook

**Files:**
- Create: `apps/mobile/src/hooks/useVenueDeepLink.ts`

No unit test (depends on `expo-linking` + Supabase + a live navigator); verified by typecheck (Task 5) and on-device (Task 5). The parsing logic it relies on is already tested in Task 1.

- [ ] **Step 1: Write the hook**

Create `apps/mobile/src/hooks/useVenueDeepLink.ts`:

```ts
// src/hooks/useVenueDeepLink.ts
//
// Routes venue QR deep links into the app. The web bridge (happitime.biz/v/{slug})
// records the visit, then opens happitime://venue/{slug}?src=qr. This hook catches
// that URL (cold start + foreground), resolves the slug to a venueId, and opens the
// venue screen with a one-shot "Checked in!" banner.
//
// Display-only: attribution was already recorded by the web bridge (source=qr), so
// we deliberately do NOT re-fire track-visit here (the app uses a different session
// id than the web, so a second call would double-count the same scan).
//
// Mirrors useNotificationNavigation / useMagicLinkListener (manual expo-linking
// listeners + navigationRef), since the app does not use NavigationContainer linking.

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { supabase } from "../api/supabaseClient";
import { parseVenueLink } from "../lib/parseVenueLink";

// On cold start the deep link can arrive before the navigator is mounted. Poll
// isReady briefly so the primary (app-launched-by-link) case isn't dropped.
async function waitForNav(
  navigationRef: React.RefObject<any>,
  timeoutMs = 3000,
): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const nav = navigationRef.current;
    if (nav?.isReady?.()) return nav;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export function useVenueDeepLink(navigationRef: React.RefObject<any>) {
  useEffect(() => {
    let cancelled = false;

    async function handleUrl(url: string) {
      const parsed = parseVenueLink(url);
      if (!parsed) return; // not a venue link (e.g. auth/...) — ignore
      try {
        const { data, error } = await supabase
          .from("venues")
          .select("id")
          .eq("slug", parsed.slug)
          .maybeSingle();
        if (cancelled || error || !data?.id) return;
        const nav = await waitForNav(navigationRef);
        if (cancelled || !nav) return;
        nav.navigate("VenuePreview", {
          venueId: data.id as string,
          fromScan: parsed.src === "qr",
        });
      } catch {
        // Never block the app open on a failed resolve.
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [navigationRef]);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/hooks/useVenueDeepLink.ts
git commit -m "feat(mobile-qr): useVenueDeepLink hook (resolve slug, route to venue)"
```

---

## Task 3: Wire the param type and mount the hook

**Files:**
- Modify: `apps/mobile/src/navigation/types.ts`
- Modify: `apps/mobile/src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Add `fromScan` to the `VenuePreview` params**

In `apps/mobile/src/navigation/types.ts`, change the `VenuePreview` line inside `RootStackParamList`:

```ts
  VenuePreview?: { venueId: string; fromScan?: boolean };
```

- [ ] **Step 2: Mount the hook in `AppNavigator`**

In `apps/mobile/src/navigation/AppNavigator.tsx`, add the import near the other hook import (`useNotificationNavigation` is imported on line 8):

```ts
import { useVenueDeepLink } from "../hooks/useVenueDeepLink";
```

Then, immediately after the existing `useNotificationNavigation(navigationRef);` call (line 109), add:

```ts
  useVenueDeepLink(navigationRef);
```

- [ ] **Step 3: Typecheck**

Run: `npm run -w @happitime/mobile typecheck` — if that workspace name doesn't resolve, run instead:
`cd apps/mobile && npx tsc -p tsconfig.json --noEmit`
Expected: no errors. (Confirms the new param type and hook wiring are consistent.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/navigation/types.ts apps/mobile/src/navigation/AppNavigator.tsx
git commit -m "feat(mobile-qr): route venue deep links via VenuePreview + fromScan param"
```

---

## Task 4: "✓ Checked in!" banner on the venue screen

**Files:**
- Modify: `apps/mobile/src/screens/VenuePreviewScreen.tsx`

The screen reads `const { venueId } = route.params;` (line 73), uses `useSafeAreaInsets()` (line 74), and the main render returns `<View style={styles.container}>` (line 229). It imports from `react-native` (lines 2-12) and `useEffect`/`useRef` are NOT yet imported (only `useMemo, useState` on line 1).

- [ ] **Step 1: Add `Animated` + `useEffect`/`useRef` imports**

In `apps/mobile/src/screens/VenuePreviewScreen.tsx`, change the React import (line 1):

```ts
import React, { useEffect, useMemo, useRef, useState } from "react";
```

And add `Animated` to the `react-native` import list (the block on lines 2-12 that imports `View`, `Text`, …):

```ts
  Animated,
```

(add it as one more entry in that import block — any position is fine).

- [ ] **Step 2: Add banner state + the one-shot fade effect**

In the component body, immediately after `const [checkedIn, setCheckedIn] = useState(false);` (line 79), add:

```ts
  // One-shot "Checked in!" confirmation when arriving from a QR scan
  // (route param fromScan). Display-only — the web bridge already recorded the
  // visit; we just confirm it. Cleared after showing so back-nav won't replay it.
  const bannerShown = useRef(false);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const [showScanBanner, setShowScanBanner] = useState(false);

  useEffect(() => {
    if (bannerShown.current) return;
    if (route.params?.fromScan !== true) return;
    bannerShown.current = true;
    setShowScanBanner(true);
    navigation.setParams({ fromScan: false });
    Animated.sequence([
      Animated.timing(bannerOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(bannerOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowScanBanner(false));
  }, [route.params, navigation, bannerOpacity]);
```

- [ ] **Step 3: Render the banner inside the main container**

In the main return, immediately after the opening `<View style={styles.container}>` (line 229), add:

```tsx
      {showScanBanner ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.scanBanner, { opacity: bannerOpacity, top: insets.top + spacing.sm }]}
        >
          <Text style={styles.scanBannerText}>✓ Checked in!</Text>
        </Animated.View>
      ) : null}
```

- [ ] **Step 4: Add the banner styles**

In the `StyleSheet.create({ … })` block, add these two entries:

```ts
  scanBanner: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: "#EAF6EC",
  },
  scanBannerText: {
    color: "#1B7A34",
    fontSize: 15,
    fontWeight: "600",
  },
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/VenuePreviewScreen.tsx
git commit -m "feat(mobile-qr): one-shot 'Checked in!' banner on QR arrival"
```

---

## Task 5: Verification (typecheck + on-device)

**Files:** none (verification).

- [ ] **Step 1: Lint + typecheck the mobile app**

Run: `cd apps/mobile && npx tsc -p tsconfig.json --noEmit && npm run lint`
Expected: no type errors; lint passes (or only pre-existing warnings).

- [ ] **Step 2: Cold-start deep link (app not running)**

With the app installed on a device/simulator and fully closed, trigger the deep link:
`npx uri-scheme open "happitime://venue/sea-capitan?src=qr" --ios`  (or `--android`)
(Use a slug that exists in your DB.)
Expected: the app launches, lands on the venue screen for that slug, and shows the "✓ Checked in!" banner for ~3s. **No** second visit is recorded (display-only).

- [ ] **Step 3: Warm deep link (app already open)**

With the app already foregrounded, run the same `uri-scheme open` command.
Expected: navigates to the venue screen and shows the banner.

- [ ] **Step 4: Unknown slug is a safe no-op**

Run: `npx uri-scheme open "happitime://venue/this-slug-does-not-exist?src=qr" --ios`
Expected: app opens; no navigation, no banner, no crash.

- [ ] **Step 5: Auth deep link still works**

Confirm a magic-link/auth deep link (`happitime://auth/...`) still authenticates as before — the new listener must ignore it (parser returns null).

- [ ] **Step 6: Record verification result** (PASS/FAIL with what you observed on which platform).

---

## Task 6: Deploy (OTA, gated)

**Files:** none (release).

> ⚠️ Outward-facing: `eas update --channel production` publishes to real users' devices. Get explicit human go-ahead before running it.

- [ ] **Step 1: Merge the feature branch** (open a PR to `master`, ensure CI green, merge — repo convention is a merge commit).

- [ ] **Step 2: Confirm OTA eligibility**

Verify the change is JS-only (it is — new TS files + edits, no native module added; `expo-linking` and the `happitime` scheme already ship). Then confirm the **live production build's `runtimeVersion` matches `1.0.3`** (policy `appVersion`):
`eas update:list --channel production` (and/or check the latest production build's runtime in the EAS dashboard).
Expected: live build runtime == 1.0.3. If it differs, STOP — the change needs a new store build, not an OTA.

- [ ] **Step 3: Publish the OTA update** (only after Step 2 confirms eligibility and a human approves)

Run: `cd apps/mobile && eas update --channel production --message "in-app QR scan confirmation"`
Expected: update published to the `production` channel for runtime 1.0.3.

- [ ] **Step 4: Verify on a device** that has the production build: scan a real venue QR → app opens to the venue with the "✓ Checked in!" banner. Record PASS/FAIL.

---

## Self-Review notes

- **Spec coverage:** parser (Task 1), listener + slug→venueId resolve + navigate (Task 2), param type + mount (Task 3), display-only banner with no track-visit re-fire (Task 4), cold/warm/unknown-slug/auth-coexistence verification (Task 5), OTA-gated deploy with runtime check (Task 6). All spec sections mapped.
- **Type consistency:** `parseVenueLink(url): ParsedVenueLink | null` and `{ slug, src }` used identically in Task 1, 2; `VenuePreview` param `{ venueId, fromScan }` consistent across types.ts (Task 3), the hook's `nav.navigate` (Task 2), and the screen's `route.params.fromScan` (Task 4); `useVenueDeepLink(navigationRef)` signature matches the mount call.
- **Double-count guard:** the in-app path never calls `track-visit` (Task 4 banner is display-only); attribution remains solely the web bridge's `source=qr` event.
- **Known follow-ups (out of scope):** true universal links (AASA + entitlement); unifying web/app session ids.
