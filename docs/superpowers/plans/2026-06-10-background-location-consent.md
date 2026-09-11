# Background-Location Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make background ("Always") location an explicit, in-context opt-in (consent modal on first favorite + a Settings toggle), so the OS "Always" prompt never fires off the back of the foreground onboarding step.

**Architecture:** Add a distinct `user_preferences.background_location_consent` flag (separate from the foreground `location_enabled`). `App.tsx`'s background-tracking effect gates on that flag instead of `location_enabled`. A priming modal (`BackgroundLocationConsentModal`) requests the OS background permission only after the user taps **Enable**; a "Nearby reminders" toggle on the Profile screen is the durable control. The 2-factor check-in (code + foreground geofence) is untouched.

**Tech Stack:** Supabase (Postgres migration), React Native / Expo (`expo-location`, `useUserPreferences`, `useUserFollowedVenues`), `node --test` source-assertions.

**Spec:** `docs/superpowers/specs/2026-06-10-background-location-consent-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260611130000_background_location_consent.sql` | add `background_location_consent` + `background_location_prompt_seen` to `user_preferences` |
| `apps/mobile/src/hooks/useUserPreferences.ts` | add the two fields to the `UserPreferences` type + `DEFAULTS` (read via `select('*')`, write via `savePreferences`) |
| `apps/mobile/src/components/BackgroundLocationConsentModal.tsx` | priming modal: explain → Enable (request bg permission + set flags) / Not now |
| `apps/mobile/src/lib/backgroundConsentPrompt.ts` | module-level triggers (mirrors `pendingVenueLink`): (a) `triggerBackgroundConsentPrompt` — ask the root to show the consent modal; (b) `applyBackgroundTracking(active)` — start/stop tracking immediately on an in-session consent change, since `useUserPreferences` is per-instance so App.tsx won't otherwise see the modal/toggle's `savePreferences` write until relaunch. The persisted flag still covers the next-launch case via App.tsx's existing effect. |
| `apps/mobile/App.tsx` | host the modal at root; gate `startTracking()` on `background_location_consent` |
| `apps/mobile/src/hooks/useUserFollowedVenues.ts` | fire the consent-prompt trigger on a new follow |
| `apps/mobile/src/screens/ProfileScreen.tsx` | "Nearby reminders" toggle (durable control) + OS-permission reconcile |
| `apps/mobile/app.json` | clarify the NSLocation "Always" purpose string |
| `PILOT_BUILD_SPEC.md` | update §7 "never background" language |
| `test/background-location-consent.test.mjs` | migration + gating source-assertions |

---

### Task 1: Migration — consent columns

**Files:**
- Create: `supabase/migrations/20260611130000_background_location_consent.sql`
- Test: `test/background-location-consent.test.mjs`

- [ ] **Step 1: Write the migration**
```sql
-- Background ("Always") location is a DISTINCT opt-in from the foreground
-- location_enabled flag (which onboarding sets for maps + check-in). These two
-- columns track the explicit background consent + whether the one-time in-context
-- prompt has been shown.
alter table public.user_preferences
  add column if not exists background_location_consent boolean not null default false,
  add column if not exists background_location_prompt_seen boolean not null default false;
```

- [ ] **Step 2: Write the source-assertion test** (`test/background-location-consent.test.mjs`)
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const mig = readFileSync(new URL("../supabase/migrations/20260611130000_background_location_consent.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");

test("migration adds both consent columns, default false", () => {
  assert.match(mig, /background_location_consent boolean not null default false/);
  assert.match(mig, /background_location_prompt_seen boolean not null default false/);
});
test("App.tsx gates background tracking on consent, not the foreground flag", () => {
  // startTracking must be driven by background_location_consent
  assert.match(app, /background_location_consent[\s\S]*startTracking\(\)/);
});
```

- [ ] **Step 3: Run — FAIL** (`node --test test/background-location-consent.test.mjs`); the migration assertions fail (file missing) and the App.tsx assertion fails (still uses `location_enabled`). Create the migration → the first test passes; the App.tsx one stays red until Task 4.
- [ ] **Step 4: Apply locally** — prefer `supabase migration up`; if local history blocks it, `docker exec -i supabase_db_ujflcrjsiyhofnomurco psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20260611130000_background_location_consent.sql` → zero errors. Confirm the columns exist:
```bash
docker exec supabase_db_ujflcrjsiyhofnomurco psql -U postgres -d postgres -tAc "select string_agg(column_name,',') from information_schema.columns where table_name='user_preferences' and column_name like 'background_location%';"
```
Expected: `background_location_consent,background_location_prompt_seen`.
- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20260611130000_background_location_consent.sql test/background-location-consent.test.mjs
git commit -m "feat(db): user_preferences background-location consent columns"
```

---

### Task 2: Prefs hook — type + defaults

**Files:**
- Modify: `apps/mobile/src/hooks/useUserPreferences.ts`

The hook reads with `.select("*")` (auto-includes new columns) and writes via `savePreferences(patch)` — so only the TS type + `DEFAULTS` need the new fields.

- [ ] **Step 1: Add to the `UserPreferences` type** (after `location_permission_status`):
```ts
  background_location_consent: boolean;
  background_location_prompt_seen: boolean;
```
- [ ] **Step 2: Add to `DEFAULTS`** (both `false`):
```ts
  background_location_consent: false,
  background_location_prompt_seen: false,
```
- [ ] **Step 3:** `cd apps/mobile && npx tsc --noEmit` — clean (no new errors).
- [ ] **Step 4: Commit**
```bash
git add apps/mobile/src/hooks/useUserPreferences.ts
git commit -m "feat(mobile): surface background-location consent prefs"
```

---

### Task 3: `BackgroundLocationConsentModal`

**Files:**
- Create: `apps/mobile/src/components/BackgroundLocationConsentModal.tsx`

- [ ] **Step 1: Implement the modal** (primes the permission before any OS prompt; reuse the app's theme like other components — match the import style of a sibling component, e.g. `SuperUserBadge`/`InsiderCodeScreen`, for `colors`/`spacing`):
```tsx
import React, { useState } from "react";
import { Modal, Pressable, Text, View, StyleSheet, Linking } from "react-native";
import * as Location from "expo-location";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { applyBackgroundTracking } from "../lib/backgroundConsentPrompt";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export const BackgroundLocationConsentModal: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const { savePreferences } = useUserPreferences();
  const [denied, setDenied] = useState(false);

  const enable = async () => {
    // Foreground is a prerequisite for background.
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      setDenied(true);
      await savePreferences({ background_location_prompt_seen: true });
      return;
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status === "granted") {
      await savePreferences({ background_location_consent: true, background_location_prompt_seen: true });
      applyBackgroundTracking(true); // start immediately (App root owns the tracker)
      onClose();
    } else {
      setDenied(true);
      await savePreferences({ background_location_prompt_seen: true });
    }
  };

  const notNow = async () => {
    await savePreferences({ background_location_prompt_seen: true });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={notNow}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Nearby reminders</Text>
          <Text style={styles.body}>
            Get a heads-up when a happy hour or event is starting at a venue you follow —
            and check in automatically when you arrive. This uses your location in the
            background. You can turn it off anytime in Settings.
          </Text>
          {denied ? (
            <Text style={styles.note}>
              Location is off for HappiTime. You can enable it in your device Settings.
            </Text>
          ) : null}
          <Pressable style={styles.primary} onPress={denied ? () => Linking.openSettings() : enable}>
            <Text style={styles.primaryText}>{denied ? "Open Settings" : "Enable"}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={notNow}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.background, borderRadius: 16, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  note: { fontSize: 13, color: colors.muted ?? "#888" },
  primary: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: { paddingVertical: 8, alignItems: "center" },
  secondaryText: { color: colors.muted ?? "#888", fontWeight: "600" },
});
```
> Verify the actual theme exports (`colors`/`spacing` keys) against a sibling component and adjust references (e.g. `colors.muted`) to whatever exists — don't invent keys.

- [ ] **Step 2:** `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 3: Commit**
```bash
git add apps/mobile/src/components/BackgroundLocationConsentModal.tsx
git commit -m "feat(mobile): background-location consent modal (priming + bg permission)"
```

---

### Task 4: Gating change + module trigger + root wiring

**Files:**
- Create: `apps/mobile/src/lib/backgroundConsentPrompt.ts`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: Module-level triggers** (`backgroundConsentPrompt.ts`, mirrors `pendingVenueLink.ts`). Two concerns: ask the root to show the modal, and apply tracking start/stop immediately (because `useUserPreferences` is per-instance, App.tsx won't see the modal/toggle's write until relaunch):
```ts
// src/lib/backgroundConsentPrompt.ts
// Module-level bridges from non-root callers (the consent modal, the toggleFollow
// hook, the Settings toggle) to the App root, which owns the visit tracker.
let promptHandler: (() => void) | null = null;
let trackingHandler: ((active: boolean) => void) | null = null;

export function setBackgroundConsentPromptHandler(fn: (() => void) | null): void { promptHandler = fn; }
export function triggerBackgroundConsentPrompt(): void { promptHandler?.(); }

// Apply an in-session consent change to the running tracker immediately.
export function setBackgroundTrackingHandler(fn: ((active: boolean) => void) | null): void { trackingHandler = fn; }
export function applyBackgroundTracking(active: boolean): void { trackingHandler?.(active); }
```

- [ ] **Step 2: Gate `startTracking()` on the consent flag** — in `App.tsx`, the effect at ~line 115 currently reads:
```ts
    if (preferences.location_enabled && venues.length > 0) {
      void startTracking();
    } else {
      void stopTracking();
    }
```
Change the condition to `preferences.background_location_consent` and update the dependency array entry from `preferences.location_enabled` to `preferences.background_location_consent`:
```ts
    if (preferences.background_location_consent && venues.length > 0) {
      void startTracking();
    } else {
      void stopTracking();
    }
```

- [ ] **Step 3: Host the modal at root** — in `App.tsx`'s component, add state + register the handler + render the modal:
```ts
const [bgConsentVisible, setBgConsentVisible] = useState(false);
useEffect(() => {
  setBackgroundConsentPromptHandler(() => {
    // Only show if not already decided.
    if (!preferences.background_location_prompt_seen && !preferences.background_location_consent) {
      setBgConsentVisible(true);
    }
  });
  return () => setBackgroundConsentPromptHandler(null);
}, [preferences.background_location_prompt_seen, preferences.background_location_consent]);
```
and in the JSX (near the other root-level modals, e.g. `UpdateAvailableModal`):
```tsx
<BackgroundLocationConsentModal visible={bgConsentVisible} onClose={() => setBgConsentVisible(false)} />
```
Also register the tracking handler so in-session consent changes take effect immediately (the App root owns `startTracking`/`stopTracking`):
```ts
useEffect(() => {
  setBackgroundTrackingHandler((active) => { if (active) void startTracking(); else void stopTracking(); });
  return () => setBackgroundTrackingHandler(null);
}, [startTracking, stopTracking]);
```
Add imports for `BackgroundLocationConsentModal`, `setBackgroundConsentPromptHandler`, and `setBackgroundTrackingHandler`. (The existing `background_location_consent` effect from Step 2 still handles the cold-launch case when prefs load.)

- [ ] **Step 4: Run the Task-1 test — now PASS** (`node --test test/background-location-consent.test.mjs`); the `App.tsx gates ... on consent` assertion is now satisfied. `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/lib/backgroundConsentPrompt.ts apps/mobile/App.tsx
git commit -m "feat(mobile): gate background tracking on explicit consent + root consent modal"
```

---

### Task 5: First-favorite trigger

**Files:**
- Modify: `apps/mobile/src/hooks/useUserFollowedVenues.ts`

- [ ] **Step 1:** In `toggleFollow`, on a **new follow** (the `.insert(...)` branch — i.e. the venue was not previously followed) and after it succeeds (no error), fire the trigger. Import at top: `import { triggerBackgroundConsentPrompt } from "../lib/backgroundConsentPrompt";`. After the successful insert path (before `return { error: null }`):
```ts
        triggerBackgroundConsentPrompt(); // root decides whether to show (gated on prompt_seen/consent)
```
Place it ONLY in the insert (follow) branch, not the delete (unfollow) branch.
- [ ] **Step 2:** `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 3: Commit**
```bash
git add apps/mobile/src/hooks/useUserFollowedVenues.ts
git commit -m "feat(mobile): prompt background-location consent on first favorite"
```

---

### Task 6: Settings toggle — "Nearby reminders"

**Files:**
- Modify: `apps/mobile/src/screens/ProfileScreen.tsx`

ProfileScreen already renders notification `Switch` rows synced from `preferences.notifications_*` via `savePreferences`. Mirror that for the consent flag, plus an OS-permission reconcile.

- [ ] **Step 1: Add local state synced from prefs** (next to `setNotifPush(...)` etc. in the prefs-sync effect):
```ts
const [nearbyReminders, setNearbyReminders] = useState(false);
// in the effect that syncs from preferences:
setNearbyReminders(preferences.background_location_consent);
```
- [ ] **Step 2: Reconcile with the OS permission on mount** — if the flag is on but the OS no longer grants background, flip it off:
```ts
useEffect(() => {
  (async () => {
    if (!preferences.background_location_consent) return;
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== "granted") {
      setNearbyReminders(false);
      await savePreferences({ background_location_consent: false });
    }
  })();
}, [preferences.background_location_consent]);
```
(Add `import * as Location from "expo-location";` if not present.)
- [ ] **Step 3: Render the toggle** (in the same section as the notification switches):
```tsx
<View style={styles.settingRow}>
  <Text style={styles.settingLabel}>Nearby reminders</Text>
  <Switch
    value={nearbyReminders}
    onValueChange={async (next) => {
      if (next) {
        const fg = await Location.requestForegroundPermissionsAsync();
        const bg = fg.status === "granted" ? await Location.requestBackgroundPermissionsAsync() : { status: "denied" as const };
        const granted = bg.status === "granted";
        setNearbyReminders(granted);
        await savePreferences({ background_location_consent: granted, background_location_prompt_seen: true });
        applyBackgroundTracking(granted); // immediate start (App root owns the tracker)
        if (!granted) Alert.alert("Location needed", "Enable Always-location for HappiTime in Settings to get nearby reminders.");
      } else {
        setNearbyReminders(false);
        await savePreferences({ background_location_consent: false });
        applyBackgroundTracking(false); // immediate stop
      }
    }}
  />
</View>
```
> Match the actual style names ProfileScreen uses for its other switch rows (`settingRow`/`settingLabel` may differ — reuse whatever the notification rows use). Add `import { applyBackgroundTracking } from "../lib/backgroundConsentPrompt";`.

- [ ] **Step 4:** `cd apps/mobile && npx tsc --noEmit` clean.
- [ ] **Step 5: Commit**
```bash
git add apps/mobile/src/screens/ProfileScreen.tsx
git commit -m "feat(mobile): 'Nearby reminders' settings toggle for background location"
```

---

### Task 7: Privacy strings + pitch language

**Files:**
- Modify: `apps/mobile/app.json`
- Modify: `PILOT_BUILD_SPEC.md`

- [ ] **Step 1: Clarify the "Always" purpose strings** in `apps/mobile/app.json` — set the `expo-location` plugin `locationAlwaysAndWhenInUsePermission` AND the iOS `NSLocationAlwaysAndWhenInUseUsageDescription` / `NSLocationAlwaysUsageDescription` to:
```
"HappiTime uses background location, only if you opt in, to remind you when a happy hour or event is starting at a venue you follow and to check you in automatically when you arrive."
```
Leave `NSLocationWhenInUseUsageDescription` (foreground/maps + check-in) as-is.
- [ ] **Step 2: Update `PILOT_BUILD_SPEC.md` §7** — replace the "location read only at check-in, never background" framing with: background location is **opt-in** (in-context consent + Settings toggle), used for proximity reminders + auto check-in; the 2-factor check-in itself uses foreground location at check-in time.
- [ ] **Step 3:** `python3 -c "import json; json.load(open('apps/mobile/app.json')); print('app.json valid')"`.
- [ ] **Step 4: Commit**
```bash
git add apps/mobile/app.json PILOT_BUILD_SPEC.md
git commit -m "docs(pilot): background-location is opt-in — purpose strings + spec language"
```

---

## Acceptance
- [ ] `background_location_consent` / `background_location_prompt_seen` exist on `user_preferences` (migration applied).
- [ ] `App.tsx` starts background tracking ONLY when `background_location_consent` is true (no longer `location_enabled`).
- [ ] Favoriting a venue for the first time shows the consent modal once; Enable requests the OS "Always" prompt; Not now / decline → no background tracking.
- [ ] The Profile "Nearby reminders" toggle turns background tracking on/off and reconciles a revoked OS permission.
- [ ] `app.json` "Always" purpose string states proximity reminders + auto check-in (opt-in); `PILOT_BUILD_SPEC.md` §7 updated.
- [ ] `apps/mobile` tsc clean; `node --test test/background-location-consent.test.mjs` green.
- [ ] **Device verify (rides next build):** first-favorite prompt → Enable → "Always" prompt → tracking starts; toggle off → tracking stops; revoke in iOS Settings → toggle reconciles off; 2-factor check-in still works independently.

## Self-Review
- **Spec coverage:** §3.1 storage → T1/T2; §3.2 modal → T3; §3.3 settings toggle → T6; §3.4 first-favorite trigger → T4 (module+root) + T5; §3.5 gating fix → T4; §3.6 privacy strings/pitch → T7. Testing (§6) → migration + gating source-assertions (T1/T4) + tsc + device-verify.
- **The load-bearing fix is T4** (App.tsx gate `location_enabled` → `background_location_consent`); everything else is the consent UX that sets that flag.
- **2-factor check-in untouched:** no task changes `verify-checkin` or the foreground capture used at check-in.
- **Type consistency:** `background_location_consent` / `background_location_prompt_seen` named identically across migration, prefs type/DEFAULTS, modal, App.tsx gate/handler, toggleFollow trigger, and the Profile toggle. `savePreferences(patch)` and `triggerBackgroundConsentPrompt()` / `setBackgroundConsentPromptHandler()` used consistently.
- **Native note:** the `app.json` purpose-string change is native — rides the next build (not OTA). The flag/modal/toggle/gating are JS → OTA-able.
