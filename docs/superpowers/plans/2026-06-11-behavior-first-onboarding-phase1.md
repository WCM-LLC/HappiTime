# Behavior-First Onboarding — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the new-user Welcome gate with the behavior-first pre-feed flow (Splash → Location → Vibes → browse as guest), and make referral/QR attribution **durable** so a guest's `?ref` survives app restarts and is credited to the originator whenever they eventually sign up.

**Architecture:** A `PreFeedOnboarding` controller renders the 3 designed screens and, on finish, drops the user into the app as a guest (existing `guestChoice="skip"` → `AppNavigator`). A local AsyncStorage "pre-feed seen" flag stops it re-showing. The in-memory `pendingReferral` becomes AsyncStorage-backed (first-wins, survives restarts); `useReferralCapture` applies it on the first signed-in session. **No auth/login changes** (signup is Phase 2).

**Tech Stack:** React Native / Expo, `@react-native-async-storage/async-storage` (already a dep, `2.2.0`), `apps/mobile/src/theme`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-11-behavior-first-onboarding-design.md`. **Visual source (recreate pixel-perfect):** `docs/design/onboarding/ob-screens.jsx`, `ob-atoms.jsx`, `colors_and_type.css`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/lib/referralHandle.mjs` (+`.d.ts`) | pure `normalizeReferralHandle(raw)` — node-testable |
| `apps/mobile/src/lib/pendingReferral.ts` | **durable** AsyncStorage stash: `setPendingReferral` (first-wins), `peekPendingReferral`, `takePendingReferral` (all async) |
| `apps/mobile/src/hooks/useReferralCapture.ts` | await the async `takePendingReferral` on first session |
| `apps/mobile/src/hooks/useVenueLinkCapture.ts` | `setPendingReferral` callers become `void` (async) |
| `apps/mobile/src/lib/prefeedOnboarded.ts` | durable "pre-feed seen" flag (AsyncStorage) + `usePrefeedOnboarded()` |
| `apps/mobile/src/screens/onboarding/atoms.tsx` | RN `ObLogo`, `ObPrimaryButton`, `ObSecondaryButton`, `ObCheckIcon`, `ObBackButton` (from `ob-atoms.jsx`) |
| `apps/mobile/src/screens/onboarding/SplashScreen.tsx` | S1 splash |
| `apps/mobile/src/screens/onboarding/LocationPrimeScreen.tsx` | S2 location prime + neighborhood fallback |
| `apps/mobile/src/screens/onboarding/VibePickerScreen.tsx` | S3 vibe picker |
| `apps/mobile/src/screens/onboarding/PreFeedOnboarding.tsx` | sequences S1→S2→S3, holds guest hood/vibes, finishes → guest |
| `apps/mobile/App.tsx` | render `PreFeedOnboarding` in the `!session && guestChoice==="prompt"` branch when not seen |
| `test/referral-handle.test.mjs`, `test/onboarding-prefeed.test.mjs` | unit + source-assertions |

---

### Task 1: Durable referral stash (the attribution guarantee)

**Files:**
- Create: `apps/mobile/src/lib/referralHandle.mjs` + `referralHandle.d.ts`
- Create: `apps/mobile/src/lib/pendingReferral.ts` (replaces `pendingReferral.mjs`)
- Modify: `apps/mobile/src/hooks/useReferralCapture.ts`, `apps/mobile/src/hooks/useVenueLinkCapture.ts`
- Delete: `apps/mobile/src/lib/pendingReferral.mjs` + `.d.ts`
- Test: `test/referral-handle.test.mjs`; replace `test/pending-referral.test.mjs`

- [ ] **Step 1: Pure normalize helper + failing test**

`apps/mobile/src/lib/referralHandle.mjs`:
```js
// Pure, node-testable handle normalizer shared by the durable referral stash.
export function normalizeReferralHandle(raw) {
  if (typeof raw !== "string") return null;
  const h = raw.replace(/^@/, "").toLowerCase().trim();
  return /^[a-z0-9_]{2,30}$/.test(h) ? h : null;
}
```
`referralHandle.d.ts`: `export declare function normalizeReferralHandle(raw: unknown): string | null;`

`test/referral-handle.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReferralHandle } from "../apps/mobile/src/lib/referralHandle.mjs";
test("normalizes + validates handles", () => {
  assert.equal(normalizeReferralHandle("@JWill86"), "jwill86");
  assert.equal(normalizeReferralHandle("bad handle"), null);
  assert.equal(normalizeReferralHandle(42), null);
  assert.equal(normalizeReferralHandle("a"), null);
});
```

- [ ] **Step 2: Run — FAIL**, implement the helper, **Run — PASS** (`node --test test/referral-handle.test.mjs`).

- [ ] **Step 3: Durable AsyncStorage stash** `apps/mobile/src/lib/pendingReferral.ts`:
```ts
// Durable (AsyncStorage) stash for an Insider referral handle captured BEFORE
// sign-in — a ?ref on a venue/itinerary deep link or a scanned /r/{handle}.
// Survives app restarts so a guest's attribution is preserved until they
// eventually create an account. FIRST-WINS: never overwrite an existing stash.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeReferralHandle } from "./referralHandle";

const KEY = "ht_pending_referral";

/** Stash a referral handle (first-wins — does nothing if one is already stored). */
export async function setPendingReferral(handle: string): Promise<void> {
  const norm = normalizeReferralHandle(handle);
  if (!norm) return;
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return; // first-wins: honor the originator
  await AsyncStorage.setItem(KEY, norm);
}

/** Read without clearing (for pre-filling the post-signup step in Phase 2). */
export async function peekPendingReferral(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

/** Read and clear (consume on successful attribution). */
export async function takePendingReferral(): Promise<string | null> {
  const v = await AsyncStorage.getItem(KEY);
  if (v) await AsyncStorage.removeItem(KEY);
  return v;
}
```
Note `referralHandle.d.ts` lets the `.ts` import the `.mjs` with types. Then `git rm apps/mobile/src/lib/pendingReferral.mjs apps/mobile/src/lib/pendingReferral.d.ts`.

- [ ] **Step 4: Update `useReferralCapture.ts`** — await the async take:
```ts
  useEffect(() => {
    if (!user || done.current) return;
    done.current = true;
    void (async () => {
      const handle = await takePendingReferral();
      if (!handle) { done.current = false; return; }
      await (supabase as any).rpc("record_referral", { p_referrer_handle: handle, p_source: "code" });
    })();
  }, [user]);
```
(Keep the existing imports; `takePendingReferral` is now async.)

- [ ] **Step 5: Update `useVenueLinkCapture.ts`** — every `setPendingReferral(x)` call becomes `void setPendingReferral(x)` (it's now async, fire-and-forget). No other logic change.

- [ ] **Step 5b: Catch ALL other importers.** Run `grep -rn "pendingReferral" apps/mobile/src` and update every importer to the new async API + path (`../lib/pendingReferral` resolves to the `.ts` now). In particular `OnboardingScreen.tsx`'s "Who brought you?" step may `peek`/`take` the stash — switch it to `await peekPendingReferral()` (prefill, don't consume) so the durable stash isn't drained before `useReferralCapture` applies it. `cd apps/mobile && npx tsc --noEmit` must surface zero unresolved imports.

- [ ] **Step 6: Replace `test/pending-referral.test.mjs`** with `test/onboarding-prefeed.test.mjs` source-assertions (AsyncStorage can't run under node):
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const stash = readFileSync(new URL("../apps/mobile/src/lib/pendingReferral.ts", import.meta.url), "utf8");
const cap = readFileSync(new URL("../apps/mobile/src/hooks/useReferralCapture.ts", import.meta.url), "utf8");
test("pendingReferral is durable + first-wins + clear-on-take", () => {
  assert.match(stash, /AsyncStorage/);
  assert.match(stash, /if \(existing\) return;.*first-wins/s);
  assert.match(stash, /removeItem\(KEY\)/);
  assert.match(stash, /peekPendingReferral/);
});
test("useReferralCapture awaits takePendingReferral then records", () => {
  assert.match(cap, /await takePendingReferral\(\)/);
  assert.match(cap, /record_referral/);
});
```
`git rm test/pending-referral.test.mjs`.

- [ ] **Step 7:** `node --test test/referral-handle.test.mjs test/onboarding-prefeed.test.mjs` PASS; `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 8: Commit**
```bash
git add apps/mobile/src/lib/referralHandle.* apps/mobile/src/lib/pendingReferral.ts apps/mobile/src/hooks/useReferralCapture.ts apps/mobile/src/hooks/useVenueLinkCapture.ts test/referral-handle.test.mjs test/onboarding-prefeed.test.mjs
git rm apps/mobile/src/lib/pendingReferral.mjs apps/mobile/src/lib/pendingReferral.d.ts test/pending-referral.test.mjs
git commit -m "feat(mobile): durable referral attribution (survives restarts, first-wins)"
```

---

### Task 2: Pre-feed "seen" flag

**Files:**
- Create: `apps/mobile/src/lib/prefeedOnboarded.ts`

- [ ] **Step 1: Implement** the durable flag + hook:
```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "ht_prefeed_onboarded";

export async function setPrefeedOnboarded(): Promise<void> { await AsyncStorage.setItem(KEY, "1"); }

/** undefined while loading; true/false once resolved. */
export function usePrefeedOnboarded(): { loading: boolean; seen: boolean; markSeen: () => Promise<void> } {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => setSeen(v === "1")); }, []);
  const markSeen = async () => { await setPrefeedOnboarded(); setSeen(true); };
  return { loading: seen === null, seen: seen === true, markSeen };
}
```
- [ ] **Step 2:** `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** `git add apps/mobile/src/lib/prefeedOnboarded.ts && git commit -m "feat(mobile): durable pre-feed onboarded flag"`

---

### Task 3: Onboarding atoms (RN translation of `ob-atoms.jsx`)

**Files:**
- Create: `apps/mobile/src/screens/onboarding/atoms.tsx`
- Reference: `docs/design/onboarding/ob-atoms.jsx` (translate `HT` colors → `apps/mobile/src/theme/colors.ts`: `bg→background`, `text→text`, `muted→textMuted`, `mutedLight→textMutedLight`, `surface→surface`, `border→border`, `dark→dark`, `brandSubtle→brandSubtle`)

- [ ] **Step 1: Implement** the shared atoms used by all three screens. Read `ob-atoms.jsx` for exact glyph/spacing; the public API:
```tsx
import React from "react";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { colors } from "../../theme/colors";

export const ObLogo: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <Text style={{ fontSize: size, fontWeight: "800", letterSpacing: -0.7, color: colors.text }}>
    Happi<Text style={{ color: colors.primary }}>Time</Text>
  </Text>
);

export const ObPrimaryButton: React.FC<{ label: string; onPress: () => void; disabled?: boolean; busy?: boolean }> =
  ({ label, onPress, disabled, busy }) => (
  <Pressable onPress={onPress} disabled={disabled || busy}
    style={({ pressed }) => ({ backgroundColor: disabled ? colors.borderStrong : colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.9 : 1 })}>
    {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{label}</Text>}
  </Pressable>
);

export const ObSecondaryButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <Pressable onPress={onPress} style={{ paddingVertical: 12, alignItems: "center" }}>
    <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: "600" }}>{label}</Text>
  </Pressable>
);
```
Add `ObBackButton` (a 36×36 round surface button with a chevron, per `ob-screens.jsx`) and a check glyph for the vibe chips.

- [ ] **Step 2:** `tsc --noEmit` clean.
- [ ] **Step 3: Commit** `git add apps/mobile/src/screens/onboarding/atoms.tsx && git commit -m "feat(mobile): onboarding atoms (logo, buttons)"`

---

### Task 4: SplashScreen

**Files:**
- Create: `apps/mobile/src/screens/onboarding/SplashScreen.tsx`
- Reference: `docs/design/onboarding/ob-screens.jsx` → `ObSplash`

- [ ] **Step 1: Implement** — match `ObSplash` exactly (background `colors.background`; logo; headline 40/800/-0.9 `colors.text` = "Kansas City's happy hours, live."; subtitle 16 `colors.textMuted` = "Live deals at Kansas City bars and restaurants. Built by locals, for locals."; primary "Find deals near me"; caption 12.5 `colors.textMutedLight` centered = "Browsing is free. No account needed."):
```tsx
import React from "react";
import { SafeAreaView, View, Text } from "react-native";
import { ObLogo, ObPrimaryButton } from "./atoms";
import { colors } from "../../theme/colors";

export const SplashScreen: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ flex: 1, padding: 28, justifyContent: "center", gap: 22 }}>
      <ObLogo />
      <Text style={{ fontSize: 40, fontWeight: "800", letterSpacing: -0.9, lineHeight: 44, color: colors.text }}>
        Kansas City’s happy hours, live.
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 25, color: colors.textMuted }}>
        Live deals at Kansas City bars and restaurants. Built by locals, for locals.
      </Text>
    </View>
    <View style={{ padding: 28, gap: 14 }}>
      <ObPrimaryButton label="Find deals near me" onPress={onStart} />
      <Text style={{ fontSize: 12.5, color: colors.textMutedLight, textAlign: "center", fontWeight: "500" }}>
        Browsing is free. No account needed.
      </Text>
    </View>
  </SafeAreaView>
);
```
- [ ] **Step 2:** `tsc` clean. **Step 3: Commit** `feat(mobile): onboarding splash screen`.

---

### Task 5: LocationPrimeScreen

**Files:**
- Create: `apps/mobile/src/screens/onboarding/LocationPrimeScreen.tsx`
- Reference: `docs/design/onboarding/ob-screens.jsx` → `ObLocationPrime` + `ObMapVisual`

- [ ] **Step 1: Implement** — props `{ onBack, onContinue, hood, setHood, locationDenied, setLocationDenied }`. Behavior from `ObLocationPrime`:
  - Headline "Deals within walking distance" (29/800), body about using location only while in-app.
  - **Decorative map visual:** if `react-native-svg` is installed, port `ObMapVisual` (grid + accent pins); else render a lightweight placeholder (a `colors.brandSubtle` rounded box ~170px tall with a few `colors.primary` dot Views). Check: `grep react-native-svg apps/mobile/package.json`.
  - Primary **"Enable location"** → `Location.requestForegroundPermissionsAsync()` (reuse the `expo-location` pattern from `OnboardingScreen.tsx`); on `granted` → `onContinue()`; on denied → `setLocationDenied(true)`.
  - Secondary **"Enter a neighborhood instead"** → reveal the neighborhood chip row (`HOODS = ['Westport','Crossroads','River Market','Plaza','Downtown','Brookside','Waldo','North KC']`); selecting sets `hood`; primary becomes "Show deals in {hood}" → `onContinue()`.
  - `ObBackButton` top-left → `onBack()`.
- [ ] **Step 2:** `tsc` clean. **Step 3: Commit** `feat(mobile): onboarding location-prime screen`.

---

### Task 6: VibePickerScreen

**Files:**
- Create: `apps/mobile/src/screens/onboarding/VibePickerScreen.tsx`
- Reference: `docs/design/onboarding/ob-screens.jsx` → `ObVibePicker`

- [ ] **Step 1: Implement** — props `{ onBack, onContinue, vibes, setVibes }`. From `ObVibePicker`:
  - Header with `ObBackButton` + a "Skip" text button (right) → clears vibes + `onContinue()`.
  - Title "What’s your scene?" (29/800), subtitle "Pick any. This filters tonight’s deals — change it whenever."
  - 2-col grid of `VIBES = [['dive','Dive bar'],['cocktails','Cocktails'],['patio','Patio'],['sports','Sports bar'],['late','Late-night eats'],['brewery','Brewery'],['margs','Margs & tacos'],['wine','Wine']]`; tapping toggles membership in `vibes` (selected = `colors.dark` bg + white text + check glyph; else `colors.surface` + `colors.border`).
  - Footer primary: `vibes.length ? "Show tonight’s deals (" + n + ")" : "Show tonight’s deals"` → `onContinue()`.
- [ ] **Step 2:** `tsc` clean. **Step 3: Commit** `feat(mobile): onboarding vibe-picker screen`.

---

### Task 7: PreFeedOnboarding controller

**Files:**
- Create: `apps/mobile/src/screens/onboarding/PreFeedOnboarding.tsx`
- Test: extend `test/onboarding-prefeed.test.mjs`

- [ ] **Step 1: Implement** the sequencer:
```tsx
import React, { useState } from "react";
import { SplashScreen } from "./SplashScreen";
import { LocationPrimeScreen } from "./LocationPrimeScreen";
import { VibePickerScreen } from "./VibePickerScreen";

type Step = "splash" | "location" | "vibes";

export const PreFeedOnboarding: React.FC<{ onDone: (guest: { hood: string | null; vibes: string[] }) => void }> = ({ onDone }) => {
  const [step, setStep] = useState<Step>("splash");
  const [hood, setHood] = useState<string | null>(null);
  const [vibes, setVibes] = useState<string[]>([]);
  const [locationDenied, setLocationDenied] = useState(false);

  if (step === "splash") return <SplashScreen onStart={() => setStep("location")} />;
  if (step === "location") return (
    <LocationPrimeScreen onBack={() => setStep("splash")} onContinue={() => setStep("vibes")}
      hood={hood} setHood={setHood} locationDenied={locationDenied} setLocationDenied={setLocationDenied} />
  );
  return <VibePickerScreen onBack={() => setStep("location")} onContinue={() => onDone({ hood, vibes })} vibes={vibes} setVibes={setVibes} />;
};
```
(Guest `hood`/`vibes` are passed to `onDone`; persisting them to `user_preferences` is Phase 3 — Phase 1 just carries them out so the App root can stash them locally if desired.)

- [ ] **Step 2: Source-assertion test** (append to `test/onboarding-prefeed.test.mjs`):
```js
import { readFileSync as rf2 } from "node:fs";
const ctl = rf2(new URL("../apps/mobile/src/screens/onboarding/PreFeedOnboarding.tsx", import.meta.url), "utf8");
test("PreFeedOnboarding sequences splash → location → vibes → onDone", () => {
  assert.match(ctl, /"splash"[\s\S]*"location"[\s\S]*"vibes"/);
  assert.match(ctl, /onDone\(\{ hood, vibes \}\)/);
});
```
- [ ] **Step 3:** `node --test test/onboarding-prefeed.test.mjs` PASS; `tsc` clean. **Step 4: Commit** `feat(mobile): pre-feed onboarding controller`.

---

### Task 8: Wire into App.tsx (the gate rewire)

**Files:**
- Modify: `apps/mobile/App.tsx`
- Test: extend `test/onboarding-prefeed.test.mjs`

- [ ] **Step 1:** Import `PreFeedOnboarding` + `usePrefeedOnboarded`. In `AppRoot`, add `const prefeed = usePrefeedOnboarded();`.
- [ ] **Step 2:** In the `if (!session)` block, replace the `guestChoice === "prompt"` Welcome card with the pre-feed flow (keep the `"signin"` and `"skip"` branches exactly as they are — the LOGIN INVARIANT):
```tsx
  if (!session) {
    if (guestChoice === "signin") return <AuthScreen />;
    if (guestChoice === "skip") return <AppNavigator initialTab="Map" />;
    // guestChoice === "prompt": show the behavior-first pre-feed flow (once).
    if (prefeed.loading) return <LoadingView message={""} />;
    if (!prefeed.seen) {
      return (
        <PreFeedOnboarding onDone={async ({ hood, vibes }) => {
          // Carry guest selections out (local-only in Phase 1); enter the app as guest.
          await prefeed.markSeen();
          setGuestChoice("skip");
        }} />
      );
    }
    // Already saw the pre-feed flow but still no account → straight into guest browse.
    return <AppNavigator initialTab="Map" />;
  }
```
This removes the old "Welcome to HappiTime / Create Account / Sign In" card for new users (signup is now earned, Phase 2). The signed-in path below is unchanged.

- [ ] **Step 3: Source-assertion test** (append):
```js
const appsrc = rf2(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");
test("App gate shows PreFeedOnboarding for new guests, preserves signin/skip", () => {
  assert.match(appsrc, /PreFeedOnboarding/);
  assert.match(appsrc, /guestChoice === "signin"[\s\S]*AuthScreen/);   // login invariant: untouched
  assert.match(appsrc, /markSeen\(\)[\s\S]*setGuestChoice\("skip"\)/);
});
```
- [ ] **Step 4:** `node --test test/onboarding-prefeed.test.mjs` PASS; `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/App.tsx test/onboarding-prefeed.test.mjs
git commit -m "feat(mobile): behavior-first pre-feed onboarding at the new-user gate"
```

---

## Phase 1 Acceptance
- [ ] New user launches → Splash → Location (or neighborhood) → Vibes → lands in the app as a **guest** (no account). The old Welcome/Create-Account card is gone.
- [ ] The pre-feed flow shows **once** (durable `ht_prefeed_onboarded`).
- [ ] A `?ref`/`/r/{handle}` captured as a guest is stored **durably** (survives a restart), first-wins, and is applied via `record_referral` on the first signed-in session.
- [ ] **Login invariant:** `guestChoice==="signin"` → `AuthScreen` and the signed-in path are unchanged; existing users sign in exactly as before.
- [ ] `apps/mobile` tsc clean; all Phase 1 tests green.
- [ ] **Device-verify (rides next build):** the 3 screens match `docs/design/onboarding/` and the QR-as-guest → later-signup → attribution path works.

## Self-Review
- **Spec coverage (Phase 1 slice of §9):** 3 screens → Tasks 3–6; guest entry rewire → Tasks 2,7,8; durable attribution (§6) → Task 1. Login invariant (§2.4) → Task 8 (signin/skip branches untouched + asserted).
- **AsyncStorage constraint:** pure logic in `referralHandle.mjs` (node-tested); AsyncStorage modules verified by source-assertion (consistent with repo RN-native testing).
- **Deferred to later phases (not here):** earned signup + gated actions + post-signup capture (Phase 2); vibes/hood → `user_preferences` persistence + contextual notif (Phase 3). Phase 1 carries guest selections out of `onDone` but only stashes them locally.
- **Type/name consistency:** `setPendingReferral`/`peekPendingReferral`/`takePendingReferral` (async), `normalizeReferralHandle`, `usePrefeedOnboarded`/`markSeen`, `PreFeedOnboarding`/`onDone({hood,vibes})`, atoms `ObLogo`/`ObPrimaryButton`/`ObSecondaryButton` used consistently across tasks.
- **Native note:** all Phase 1 is JS → OTA-able; no native deps added (uses existing AsyncStorage + expo-location).
