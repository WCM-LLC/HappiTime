# Background-Location Disclosure Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate Android background location behind an explicit "Visit reminders" opt-in with a prominent in-app disclosure, decoupled from the foreground "Use current location" toggle, so Google Play approves the 1.0.5 background-location declaration.

**Architecture:** A device-local consent flag (AsyncStorage) backed by a shared module-level store so the Settings toggle and `App.tsx` stay in sync. A presentational disclosure `Modal` shown before consent is granted. `App.tsx` gates `startTracking()` on a pure `shouldTrack()` helper using the consent flag; `startTracking` now reports `"granted"|"denied"` so denial resets the flag.

**Tech Stack:** React Native / Expo, `@react-native-async-storage/async-storage`, `expo-location`, `node:test` for pure-logic tests.

## Global Constraints

- Work in `apps/mobile` (the workspace that ships production Android — `channel=production`).
- Pure, testable logic is authored as `.mjs` with a `.d.ts` companion and a `.test.mjs` (mirror `src/lib/parseItineraryLink.mjs` + `.d.ts`). Run tests with `node --test <file>`.
- AsyncStorage consent key: `happitime:visit_reminders_enabled` (string `"true"`/`"false"`).
- TypeScript + lint must pass after each TS change: `npx tsc --noEmit` and `npx eslint <files>` (run from `apps/mobile`).
- Do not change the foreground "Use current location" (`location_enabled`) behavior.
- Disclosure copy (verbatim) — Title: `Turn on visit reminders?` Body: `HappiTime uses your location — including in the background, when the app is closed or not in use — to detect when you're near a participating venue and send optional happy-hour and visit reminders. This is optional; discovering, searching, and saving venues all work without it. You can turn it off any time in Settings.` Actions: `Not now` / `Turn on reminders`.

---

### Task 1: `shouldTrack` pure gate helper

**Files:**
- Create: `apps/mobile/src/lib/visitTrackingGate.mjs`
- Create: `apps/mobile/src/lib/visitTrackingGate.d.ts`
- Test: `apps/mobile/src/lib/visitTrackingGate.test.mjs`

**Interfaces:**
- Produces: `shouldTrack({ consent: boolean, consentLoading: boolean, venueCount: number }): boolean` — `false` while loading; otherwise `consent && venueCount > 0`.

- [ ] **Step 1: Write the failing test**

```js
// apps/mobile/src/lib/visitTrackingGate.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { shouldTrack } from "./visitTrackingGate.mjs";

test("no consent → no tracking", () => {
  assert.equal(shouldTrack({ consent: false, consentLoading: false, venueCount: 5 }), false);
});

test("still loading consent → no tracking even if consent true", () => {
  assert.equal(shouldTrack({ consent: true, consentLoading: true, venueCount: 5 }), false);
});

test("consent true but no venues → no tracking", () => {
  assert.equal(shouldTrack({ consent: true, consentLoading: false, venueCount: 0 }), false);
});

test("consent true, loaded, venues present → track", () => {
  assert.equal(shouldTrack({ consent: true, consentLoading: false, venueCount: 1 }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && node --test src/lib/visitTrackingGate.test.mjs`
Expected: FAIL — cannot find module `./visitTrackingGate.mjs`.

- [ ] **Step 3: Write the implementation + types**

```js
// apps/mobile/src/lib/visitTrackingGate.mjs
// Pure decision for whether background visit tracking should be active.
// Kept dependency-free so it runs under node:test.
export function shouldTrack({ consent, consentLoading, venueCount }) {
  if (consentLoading) return false;
  return consent && venueCount > 0;
}
```

```ts
// apps/mobile/src/lib/visitTrackingGate.d.ts
// Types for visitTrackingGate.mjs (plain ESM impl; this declaration gives the
// app strict-mode types without compiling the runtime file).
export interface VisitTrackingGateInput {
  consent: boolean;
  consentLoading: boolean;
  venueCount: number;
}
export declare function shouldTrack(input: VisitTrackingGateInput): boolean;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && node --test src/lib/visitTrackingGate.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/visitTrackingGate.mjs apps/mobile/src/lib/visitTrackingGate.d.ts apps/mobile/src/lib/visitTrackingGate.test.mjs
git commit -m "feat(mobile): pure shouldTrack gate for visit tracking"
```

---

### Task 2: `useVisitReminderConsent` hook (shared store + AsyncStorage)

**Files:**
- Create: `apps/mobile/src/hooks/useVisitReminderConsent.ts`

**Interfaces:**
- Consumes: AsyncStorage key `happitime:visit_reminders_enabled`.
- Produces:
  - `useVisitReminderConsent(): { enabled: boolean; loading: boolean; setEnabled: (value: boolean) => Promise<void> }`
  - `setVisitReminderConsent(value: boolean): Promise<void>` (named export; same function returned as `setEnabled`).
  - A module-level store so every hook instance (Settings + `App.tsx`) re-renders on change.

- [ ] **Step 1: Write the implementation**

```ts
// apps/mobile/src/hooks/useVisitReminderConsent.ts
import { useEffect, useReducer } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "happitime:visit_reminders_enabled";

// Module-level shared store: AsyncStorage writes don't notify other hook
// instances, so the Settings toggle and App.tsx's tracking effect must read
// the same in-memory state and re-render together.
let _enabled = false;
let _loaded = false;
let _loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((l) => l());
};

const ensureLoaded = () => {
  if (_loaded || _loading) return;
  _loading = AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => {
      _enabled = v === "true";
    })
    .catch(() => {
      _enabled = false;
    })
    .finally(() => {
      _loaded = true;
      _loading = null;
      emit();
    });
};

export async function setVisitReminderConsent(value: boolean): Promise<void> {
  _enabled = value;
  _loaded = true;
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Best-effort persistence; in-memory state already reflects the choice.
  }
}

export function useVisitReminderConsent() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    ensureLoaded();
    return () => {
      listeners.delete(force);
    };
  }, []);
  return { enabled: _enabled, loading: !_loaded, setEnabled: setVisitReminderConsent };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src/hooks/useVisitReminderConsent.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useVisitReminderConsent.ts
git commit -m "feat(mobile): device-local visit-reminder consent store"
```

---

### Task 3: `BackgroundLocationDisclosure` modal

**Files:**
- Create: `apps/mobile/src/components/BackgroundLocationDisclosure.tsx`

**Interfaces:**
- Produces: `BackgroundLocationDisclosure({ visible, onAccept, onDecline }: { visible: boolean; onAccept: () => void; onDecline: () => void })` — presentational; renders nothing actionable beyond the two callbacks.

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/src/components/BackgroundLocationDisclosure.tsx
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

// Prominent disclosure shown BEFORE any background-location permission request,
// as required by Google Play policy. Wired to the "Visit reminders" opt-in.
export function BackgroundLocationDisclosure({ visible, onAccept, onDecline }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Turn on visit reminders?</Text>
          <Text style={styles.body}>
            HappiTime uses your location — including in the background, when the app is closed
            or not in use — to detect when you&apos;re near a participating venue and send
            optional happy-hour and visit reminders.{"\n\n"}This is optional; discovering,
            searching, and saving venues all work without it. You can turn it off any time in
            Settings.
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={onDecline} style={styles.secondary}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
            <Pressable onPress={onAccept} style={styles.primary}>
              <Text style={styles.primaryText}>Turn on reminders</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.lg,
    width: "100%",
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  secondary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  primary: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src/components/BackgroundLocationDisclosure.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/BackgroundLocationDisclosure.tsx
git commit -m "feat(mobile): background-location prominent disclosure modal"
```

---

### Task 4: `startTracking` reports granted/denied

**Files:**
- Modify: `apps/mobile/src/hooks/useVisitTracker.ts` (the `startTracking` useCallback, ~lines 434-465)

**Interfaces:**
- Produces: `startTracking(): Promise<"granted" | "denied">` — `"denied"` if foreground or background permission is not granted; `"granted"` once location updates are active. Returned object shape of `useVisitTracker` is otherwise unchanged.

- [ ] **Step 1: Replace the `startTracking` callback**

Find the existing `const startTracking = useCallback(async () => { ... }, []);` and replace it with:

```ts
  const startTracking = useCallback(async (): Promise<"granted" | "denied"> => {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      console.warn("[visit-tracker] foreground location permission denied");
      return "denied";
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted") {
      console.warn("[visit-tracker] background location permission denied");
      return "denied";
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 60_000,
        distanceInterval: 20,
        deferredUpdatesInterval: 60_000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "HappiTime",
          notificationBody: "Tracking visits nearby",
          notificationColor: "#C8965A",
        },
      });
    }

    setIsTracking(true);
    void captureCurrentLocation();
    return "granted";
  }, []);
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src/hooks/useVisitTracker.ts`
Expected: no errors (callers using `void startTracking()` still compile).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useVisitTracker.ts
git commit -m "feat(mobile): startTracking reports granted/denied"
```

---

### Task 5: ProfileScreen "Visit reminders" toggle + disclosure

**Files:**
- Modify: `apps/mobile/src/screens/ProfileScreen.tsx`

**Interfaces:**
- Consumes: `useVisitReminderConsent` (Task 2), `BackgroundLocationDisclosure` (Task 3).

- [ ] **Step 1: Add imports**

Add near the other hook/component imports at the top of the file:

```tsx
import { BackgroundLocationDisclosure } from "../components/BackgroundLocationDisclosure";
import { useVisitReminderConsent } from "../hooks/useVisitReminderConsent";
```

- [ ] **Step 2: Add hook + local modal state**

Inside the component body, near the other `useState` declarations (e.g. just after `const [locationEnabled, setLocationEnabled] = useState(false);`):

```tsx
  const { enabled: visitReminders, setEnabled: setVisitReminders } =
    useVisitReminderConsent();
  const [disclosureVisible, setDisclosureVisible] = useState(false);
```

- [ ] **Step 3: Add the toggle row**

Immediately AFTER the existing "Use current location" `switchRow` block and its `useNativePermissionPanel` conditional (the `) : null}` that closes the `HappiTimeIOSPermissionPanel`), insert:

```tsx
        <View style={styles.switchRow}>
          <Text style={styles.label}>Visit reminders</Text>
          <Switch
            value={visitReminders}
            onValueChange={(next) => {
              if (next) {
                // Show the prominent disclosure BEFORE enabling / requesting
                // background permission. Consent is set only on accept.
                setDisclosureVisible(true);
              } else {
                void setVisitReminders(false);
              }
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.background}
          />
        </View>
```

- [ ] **Step 4: Render the disclosure modal**

Next to the existing delete-account `<Modal>` near the end of the render (just before the closing `</KeyboardAvoidingView>`), add:

```tsx
      <BackgroundLocationDisclosure
        visible={disclosureVisible}
        onAccept={() => {
          setDisclosureVisible(false);
          void setVisitReminders(true);
        }}
        onDecline={() => setDisclosureVisible(false)}
      />
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src/screens/ProfileScreen.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/ProfileScreen.tsx
git commit -m "feat(mobile): Visit reminders opt-in with disclosure in Settings"
```

---

### Task 6: Gate `App.tsx` tracking on consent + handle denial

**Files:**
- Modify: `apps/mobile/App.tsx` (imports; the tracking `useEffect` at ~lines 123-137)

**Interfaces:**
- Consumes: `useVisitReminderConsent` (Task 2), `shouldTrack` (Task 1), `startTracking(): Promise<"granted"|"denied">` (Task 4).

- [ ] **Step 1: Add imports**

Add to the import block:

```tsx
import { shouldTrack } from "./src/lib/visitTrackingGate";
import { useVisitReminderConsent } from "./src/hooks/useVisitReminderConsent";
```

(Import without the `.mjs` extension — mirrors `../lib/parseItineraryLink`; the `.d.ts` supplies types, metro resolves the `.mjs` at runtime.)

Ensure `Alert` is imported from `react-native` (add it to the existing `react-native` import if absent).

- [ ] **Step 2: Consume the consent hook**

Near the existing `const { startTracking, stopTracking, setOnVisitDetected } = useVisitTracker(venues);`:

```tsx
  const {
    enabled: visitReminders,
    loading: consentLoading,
    setEnabled: setVisitReminders,
  } = useVisitReminderConsent();
```

- [ ] **Step 3: Replace the tracking effect**

Replace the existing effect:

```tsx
  // Start location tracking only after the user opts into location-powered features.
  useEffect(() => {
    if (preferencesLoading) return;
    if (preferences.location_enabled && venues.length > 0) {
      void startTracking();
    } else {
      void stopTracking();
    }
  }, [
    preferences.location_enabled,
    preferencesLoading,
    venues.length,
    startTracking,
    stopTracking,
  ]);
```

with:

```tsx
  // Background visit tracking runs only after explicit "Visit reminders" consent
  // (separate from the foreground "Use current location" preference). The
  // disclosure modal gates the consent flag; here we react to it.
  useEffect(() => {
    if (!shouldTrack({ consent: visitReminders, consentLoading, venueCount: venues.length })) {
      void stopTracking();
      return;
    }
    void (async () => {
      const result = await startTracking();
      if (result === "denied") {
        // App-level consent given, but the OS permission isn't granted —
        // reset the flag so it matches reality and point the user to Settings.
        await setVisitReminders(false);
        Alert.alert(
          "Visit reminders need background location",
          'Allow location access "All the time" in system Settings to get visit reminders.'
        );
      }
    })();
  }, [
    visitReminders,
    consentLoading,
    venues.length,
    startTracking,
    stopTracking,
    setVisitReminders,
  ]);
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint App.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.tsx
git commit -m "feat(mobile): gate background tracking on visit-reminder consent"
```

---

## Manual / device verification (post-implementation)

Not automatable here, but required before the Play demo video:

1. Fresh install / consent off → no background permission prompt on launch; no "Tracking visits nearby" notification.
2. Settings → toggle **Visit reminders** on → **disclosure modal appears first** → accept → OS "Allow all the time" prompt → grant → foreground-service notification appears.
3. Toggle off → tracking stops (notification clears).
4. Toggle on → accept → deny at OS prompt → toggle flips back off + alert points to Settings.

## Release-notes note

Existing users previously background-tracked via the foreground "Use current location" toggle will **stop** until they opt into "Visit reminders." This is intended (compliant) — call it out in the 1.0.x notes.
