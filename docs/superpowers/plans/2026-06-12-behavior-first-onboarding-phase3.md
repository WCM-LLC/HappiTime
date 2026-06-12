# Behavior-First Onboarding — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the guest's pre-feed selections actually do something — their picked vibes personalize the guest feed immediately, persist to their account on signup, and a contextual push-notification prime replaces any upfront permission cold-prompt.

**Architecture:** A guest's `{ hood, vibes }` (already collected by `PreFeedOnboarding`, currently discarded) is written to a durable AsyncStorage stash on completion. The guest feed (`HomeScreen`) seeds its tag filter from those vibes (mapped from onboarding keys to `approved_tags` slugs). On the first authenticated session a root-mounted hook drains the stash into `user_preferences.interests`. A separate, one-time contextual notification prime fires after the user's first successful save.

**Tech Stack:** React Native / Expo, AsyncStorage, Supabase (`user_preferences` upsert), `expo-notifications`, node:test source-assertion tests.

---

## Scope

**In scope (the three Phase-3 deliverables from the design §9):**
1. **Vibes/pref persistence** — guest vibes → durable stash → `user_preferences.interests` on signup.
2. **Vibes drive the guest feed filter** — seed `HomeScreen` `selectedTagSlugs` from guest vibes.
3. **Contextual notif prime** — one-time push-permission sheet after the first save.

**Deliberately deferred (documented, not built here):**
- **Hood/neighborhood persistence.** `user_preferences` has `home_city`/`home_state` (a *city*), no neighborhood column. Writing a neighborhood ("Westport") into `home_city` is a category error. Hood stays a guest-local signal; persisting it needs a schema change → separate ticket. Phase-3 persistence is `interests` only.
- **Lazy profile.** Already satisfied by Phase 2: `PostSignupCapture` collects only the `@handle`; display name / bio / city are filled later on the Profile screen. No new work — verified in Task 6.

## File Structure

**New files:**
- `apps/mobile/src/lib/vibeTagMap.ts` — maps the 9 onboarding vibe keys to `approved_tags` slugs; `vibesToTagSlugs()` helper. Pure, no deps.
- `apps/mobile/src/lib/guestSelections.ts` — durable AsyncStorage stash for `{ hood, vibes }` (mirror of `pendingReferral.ts`).
- `apps/mobile/src/hooks/useGuestSelectionPersist.ts` — root-mounted hook; on first session drains the stash into `user_preferences.interests` (mirror of `useGatedActionResume.ts`).
- `apps/mobile/src/lib/notifPrime.ts` — module-level trigger + durable "already primed" flag (mirror of `gatedAction.ts` + `prefeedOnboarded.ts`).
- `apps/mobile/src/components/NotifPrimeSheet.tsx` — bottom-sheet that requests push permission (reuses the registration logic shape from `useConfigPushNotifications.ts`).
- `test/onboarding-phase3.test.mjs` — source-assertion tests (mirror of `test/onboarding-phase2.test.mjs`).

**Modified files:**
- `apps/mobile/App.tsx` — `onDone` writes the stash; mount `useGuestSelectionPersist()`; mount `<NotifPrimeSheet/>` + register its handler (next to the existing `EarnedSignupSheet` wiring).
- `apps/mobile/src/screens/HomeScreen.tsx` — seed `selectedTagSlugs` from guest vibes (guests only, once).
- `apps/mobile/src/hooks/useUserFollowedVenues.ts` — after a signed-in save succeeds, fire the notif prime once.

---

### Task 1: Vibe → tag-slug mapping

The onboarding vibe keys are a curated UI list; the feed filter and `interests` need the real `approved_tags` slugs. This is the single source of truth for that translation.

**Files:**
- Create: `apps/mobile/src/lib/vibeTagMap.ts`
- Test: `test/onboarding-phase3.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/onboarding-phase3.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const map = readFileSync(new URL("../apps/mobile/src/lib/vibeTagMap.ts", import.meta.url), "utf8");

test("vibeTagMap covers every onboarding vibe key with a real approved_tags slug", () => {
  // The 9 onboarding keys from VibePickerScreen.tsx must each map to an
  // approved_tags slug (hyphenated taxonomy), not the bare onboarding key.
  for (const [key, slug] of [
    ["dive", "dive-bar"],
    ["cocktails", "cocktail-bar"],
    ["patio", "patio"],
    ["rooftop", "rooftop"],
    ["sports", "sports-bar"],
    ["late", "late-night"],
    ["brewery", "brewery"],
    ["margs", "margaritas"],
    ["wine", "wine-bar"],
  ]) {
    assert.match(map, new RegExp(`["']${key}["']\\s*:\\s*["']${slug}["']`));
  }
  assert.match(map, /export function vibesToTagSlugs/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: FAIL — `ENOENT` (vibeTagMap.ts does not exist).

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/lib/vibeTagMap.ts`:

```ts
// Translates the curated onboarding vibe keys (VibePickerScreen.tsx) into the
// canonical approved_tags slugs the feed filter and user_preferences.interests
// use. The onboarding keys are short/marketing-friendly ("late", "margs"); the
// taxonomy is hyphenated ("late-night", "margaritas"). Keep this in sync with
// the VIBES array and the approved_tags table.
export const VIBE_TO_TAG_SLUG: Record<string, string> = {
  dive: "dive-bar",
  cocktails: "cocktail-bar",
  patio: "patio",
  rooftop: "rooftop",
  sports: "sports-bar",
  late: "late-night",
  brewery: "brewery",
  margs: "margaritas",
  wine: "wine-bar",
};

/** Maps onboarding vibe keys to approved_tags slugs, dropping any unknown key. */
export function vibesToTagSlugs(vibes: string[]): string[] {
  const out: string[] = [];
  for (const v of vibes) {
    const slug = VIBE_TO_TAG_SLUG[v];
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/vibeTagMap.ts test/onboarding-phase3.test.mjs
git commit -m "feat(mobile): map onboarding vibe keys to approved_tags slugs"
```

---

### Task 2: Durable guest-selection stash

Mirror `pendingReferral.ts`: a guest's `{ hood, vibes }` must survive app restarts so the feed can use it and signup can persist it. Last-wins (the most recent completion is the truth).

**Files:**
- Create: `apps/mobile/src/lib/guestSelections.ts`
- Reference (pattern to copy): `apps/mobile/src/lib/pendingReferral.ts`
- Test: `test/onboarding-phase3.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `test/onboarding-phase3.test.mjs`:

```js
const guest = readFileSync(new URL("../apps/mobile/src/lib/guestSelections.ts", import.meta.url), "utf8");

test("guestSelections is a durable AsyncStorage stash with take-clears semantics", () => {
  assert.match(guest, /AsyncStorage/);                 // durable across restart
  assert.match(guest, /ht_guest_selections/);          // stable key
  assert.match(guest, /export async function setGuestSelections/);
  assert.match(guest, /export async function peekGuestSelections/); // read, no clear (feed)
  assert.match(guest, /export async function takeGuestSelections/); // read + clear (signup)
  assert.match(guest, /removeItem/);                   // take clears
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: FAIL — `ENOENT` (guestSelections.ts does not exist).

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/lib/guestSelections.ts`:

```ts
// Durable (AsyncStorage) stash for the guest's pre-feed selections, so they
// survive app restarts: the guest feed reads them to seed its filter (peek),
// and the first authenticated session drains them into user_preferences (take).
// LAST-WINS — re-running the pre-feed flow overwrites the previous selection.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type GuestSelections = { hood: string | null; vibes: string[] };

const KEY = "ht_guest_selections";

export async function setGuestSelections(sel: GuestSelections): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(sel));
}

function parse(raw: string | null): GuestSelections | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && Array.isArray(v.vibes)) {
      return { hood: typeof v.hood === "string" ? v.hood : null, vibes: v.vibes.filter((x) => typeof x === "string") };
    }
  } catch {
    // corrupt value — treat as absent
  }
  return null;
}

/** Read without clearing (the guest feed seeds its filter from this every load). */
export async function peekGuestSelections(): Promise<GuestSelections | null> {
  return parse(await AsyncStorage.getItem(KEY));
}

/** Read and clear (consume once, on the first authenticated session). */
export async function takeGuestSelections(): Promise<GuestSelections | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) await AsyncStorage.removeItem(KEY);
  return parse(raw);
}

export async function clearGuestSelections(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/guestSelections.ts test/onboarding-phase3.test.mjs
git commit -m "feat(mobile): durable stash for guest pre-feed selections"
```

---

### Task 3: Persist the guest's selections when the pre-feed flow completes

`App.tsx`'s `onDone` currently throws the selections away (`// Guest selections are local-only in Phase 1; persistence is Phase 3.`). Write them to the stash before entering guest browse.

**Files:**
- Modify: `apps/mobile/App.tsx` (the `<PreFeedOnboarding onDone=...>` handler, ~line 308) and its imports
- Test: `test/onboarding-phase3.test.mjs`

- [ ] **Step 1: Write the failing test** — append:

```js
const app = readFileSync(new URL("../apps/mobile/App.tsx", import.meta.url), "utf8");

test("pre-feed completion writes the guest selections to the durable stash", () => {
  assert.match(app, /setGuestSelections\(/);
  // onDone now receives the guest payload instead of discarding it
  assert.match(app, /onDone=\{async \(guest\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: FAIL — `app` does not contain `setGuestSelections(`.

- [ ] **Step 3: Implement**

In `apps/mobile/App.tsx`, add the import near the other `./src/lib` imports (e.g., next to `useReferralCapture`/`setSignInRequestHandler` imports):

```ts
import { setGuestSelections } from "./src/lib/guestSelections";
```

Replace the existing `onDone` handler:

```tsx
        <PreFeedOnboarding
          onDone={async () => {
            // Guest selections are local-only in Phase 1; persistence is Phase 3.
            // Enter guest browse even if the flag write fails (worst case: re-show next launch).
            try {
              await prefeed.markSeen();
            } finally {
              setGuestChoice("skip");
            }
          }}
        />
```

with:

```tsx
        <PreFeedOnboarding
          onDone={async (guest) => {
            // Stash the guest's selections durably so the feed can seed its
            // filter and signup can persist them (Phase 3). Enter guest browse
            // even if a write fails (worst case: no personalization this run).
            try {
              await setGuestSelections(guest);
              await prefeed.markSeen();
            } finally {
              setGuestChoice("skip");
            }
          }}
        />
```

- [ ] **Step 4: Run test to verify it passes + typecheck**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: PASS (3 tests).
Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors (`onDone`'s `guest` param is typed `{ hood: string | null; vibes: string[] }` by `PreFeedOnboarding`, which matches `GuestSelections`).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.tsx test/onboarding-phase3.test.mjs
git commit -m "feat(mobile): stash guest selections on pre-feed completion"
```

---

### Task 4: Persist vibes → user_preferences.interests on first session

Mirror `useGatedActionResume.ts`: a root-mounted hook that, on the first authenticated session, drains the stash and upserts the mapped vibe slugs into `user_preferences.interests`. Single-fire; clears the stash so it never re-applies.

**Files:**
- Create: `apps/mobile/src/hooks/useGuestSelectionPersist.ts`
- Reference (pattern): `apps/mobile/src/hooks/useGatedActionResume.ts`
- Modify: `apps/mobile/App.tsx` (mount the hook next to `useGatedActionResume()`)
- Test: `test/onboarding-phase3.test.mjs`

- [ ] **Step 1: Write the failing test** — append:

```js
const persist = readFileSync(new URL("../apps/mobile/src/hooks/useGuestSelectionPersist.ts", import.meta.url), "utf8");

test("guest selections persist to interests on first session, via a fresh signed-in hook", () => {
  assert.match(persist, /takeGuestSelections\(\)/);           // consume once
  assert.match(persist, /vibesToTagSlugs\(/);                 // map to taxonomy slugs
  assert.match(persist, /savePreferences\(\{[^}]*interests/); // write interests
  assert.match(app, /useGuestSelectionPersist\(\)/);          // mounted at root
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: FAIL — `ENOENT` (useGuestSelectionPersist.ts does not exist).

- [ ] **Step 3: Implement**

Create `apps/mobile/src/hooks/useGuestSelectionPersist.ts`:

```ts
// After signup, drains the durable guest-selection stash (vibes the guest
// picked before having an account) into user_preferences.interests, using THIS
// hook's instance — mounted at the signed-in App root, so savePreferences has
// the current user. Fires once per sign-in; clears the stash on apply so it
// never re-runs. Hood is intentionally NOT persisted (no neighborhood column;
// see the plan's Scope note) — it stays a guest-local feed signal.
import { useEffect, useRef } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { useUserPreferences } from "./useUserPreferences";
import { takeGuestSelections } from "../lib/guestSelections";
import { vibesToTagSlugs } from "../lib/vibeTagMap";

export function useGuestSelectionPersist(): void {
  const { user } = useCurrentUser();
  const { savePreferences } = useUserPreferences();
  const done = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      done.current = false; // reset for the next sign-in
      return;
    }
    if (done.current) return;
    done.current = true; // claim synchronously so the async read fires once

    let cancelled = false;
    void (async () => {
      const sel = await takeGuestSelections();
      if (cancelled || !sel) return;
      const interests = vibesToTagSlugs(sel.vibes);
      if (interests.length === 0) return;
      await savePreferences({ interests });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, savePreferences]);
}
```

In `apps/mobile/App.tsx`, add the import next to `useGatedActionResume`:

```ts
import { useGuestSelectionPersist } from "./src/hooks/useGuestSelectionPersist";
```

and mount it right after the existing `useGatedActionResume();` call:

```ts
  useGatedActionResume();
  useGuestSelectionPersist();
```

- [ ] **Step 4: Run test + typecheck**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: PASS (4 tests).
Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/useGuestSelectionPersist.ts apps/mobile/App.tsx test/onboarding-phase3.test.mjs
git commit -m "feat(mobile): persist guest vibes to preferences on signup"
```

---

### Task 5: Seed the guest feed filter from the picked vibes

The guest feed should open already filtered to the vibes they chose. Seed `HomeScreen`'s `selectedTagSlugs` from `peekGuestSelections()` once, for guests only, and only after the `approved_tags` taxonomy has loaded (so the seeded slugs are valid filter chips). Peek (not take) — the persist hook owns clearing.

**Files:**
- Modify: `apps/mobile/src/screens/HomeScreen.tsx` (the `selectedTagSlugs` state ~line 144; add a seeding effect)
- Test: `test/onboarding-phase3.test.mjs`

- [ ] **Step 1: Write the failing test** — append:

```js
const home = readFileSync(new URL("../apps/mobile/src/screens/HomeScreen.tsx", import.meta.url), "utf8");

test("guest feed seeds its tag filter from the stashed vibes (peek, once, guests only)", () => {
  assert.match(home, /peekGuestSelections\(\)/);
  assert.match(home, /vibesToTagSlugs\(/);
  assert.match(home, /setSelectedTagSlugs\(/);
  // guarded to guests so a signed-in user's manual filter is never overridden
  assert.match(home, /!user/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: FAIL — `home` does not contain `peekGuestSelections()`.

- [ ] **Step 3: Implement**

In `apps/mobile/src/screens/HomeScreen.tsx`:

Add imports near the other `../lib`/hook imports:

```ts
import { useCurrentUser } from "../hooks/useCurrentUser";
import { peekGuestSelections } from "../lib/guestSelections";
import { vibesToTagSlugs } from "../lib/vibeTagMap";
```

`HomeScreen` has no current-user scope today (confirmed: no `useCurrentUser`/`session` reference). Add the hook call near the top of the component body, alongside the existing `const { byCategory: tagsByCategory } = useApprovedTags();`:

```ts
  const { user } = useCurrentUser();
```

Add this effect immediately after the `toggleTagSlug` `useCallback` (~line 161). Use a module-or-ref guard so it seeds exactly once per mount and never fights the user:

```tsx
  // Seed the guest feed's filter from the vibes picked in onboarding. Guests
  // only (never override a signed-in user's manual selection), once, and only
  // after the approved_tags taxonomy has loaded so the slugs resolve to chips.
  const seededVibes = React.useRef(false);
  React.useEffect(() => {
    if (user || seededVibes.current) return;
    const vibeTags = Object.values(tagsByCategory).flat();
    if (vibeTags.length === 0) return; // taxonomy not loaded yet
    seededVibes.current = true;
    void peekGuestSelections().then((sel) => {
      if (!sel) return;
      const slugs = vibesToTagSlugs(sel.vibes).filter((slug) =>
        vibeTags.some((t) => t.slug === slug)
      );
      if (slugs.length > 0) setSelectedTagSlugs(new Set(slugs));
    });
  }, [user, tagsByCategory]);
```

- [ ] **Step 4: Run test + typecheck**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: PASS (5 tests).
Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/HomeScreen.tsx test/onboarding-phase3.test.mjs
git commit -m "feat(mobile): seed guest feed filter from picked vibes"
```

---

### Task 6: Contextual notification prime after the first save

Replace any upfront push cold-prompt with a one-time, value-moment prime: after the user's **first successful save**, show a sheet offering to enable happy-hour alerts. Reuse the permission request, persist the outcome, and never show twice.

**Files:**
- Create: `apps/mobile/src/lib/notifPrime.ts` (module trigger + durable "primed" flag)
- Create: `apps/mobile/src/components/NotifPrimeSheet.tsx`
- Reference (patterns): `apps/mobile/src/lib/gatedAction.ts`, `apps/mobile/src/lib/prefeedOnboarded.ts`, `apps/mobile/src/hooks/useConfigPushNotifications.ts`
- Modify: `apps/mobile/src/hooks/useUserFollowedVenues.ts` (fire the prime after a signed-in save succeeds), `apps/mobile/App.tsx` (mount the sheet + register its handler)
- Test: `test/onboarding-phase3.test.mjs`

- [ ] **Step 1: Write the failing test** — append:

```js
const notifLib = readFileSync(new URL("../apps/mobile/src/lib/notifPrime.ts", import.meta.url), "utf8");
const notifSheet = readFileSync(new URL("../apps/mobile/src/components/NotifPrimeSheet.tsx", import.meta.url), "utf8");
const follow = readFileSync(new URL("../apps/mobile/src/hooks/useUserFollowedVenues.ts", import.meta.url), "utf8");

test("notif prime: durable once-only trigger, fired after a save, requests permission at the sheet", () => {
  assert.match(notifLib, /ht_notif_primed/);               // durable once-only flag
  assert.match(notifLib, /export function requestNotifPrime/);
  assert.match(notifLib, /export function setNotifPrimeHandler/);
  assert.match(follow, /maybeRequestNotifPrime\(\)/);       // fired after a successful save
  assert.match(notifSheet, /requestPermissionsAsync/);      // asks for push permission
  assert.match(app, /NotifPrimeSheet/);                     // mounted at root
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: FAIL — `ENOENT` (notifPrime.ts / NotifPrimeSheet.tsx do not exist).

- [ ] **Step 3: Implement**

Create `apps/mobile/src/lib/notifPrime.ts`:

```ts
// One-time contextual push-notification prime. A module-level handler (set by
// App root) opens the sheet; a durable AsyncStorage flag ("ht_notif_primed")
// guarantees the prime is offered at most once per install. Mirrors gatedAction
// (handler) + prefeedOnboarded (durable flag).
import AsyncStorage from "@react-native-async-storage/async-storage";

const FLAG = "ht_notif_primed";

type NotifPrimeHandler = () => void;
let handler: NotifPrimeHandler | null = null;

export function setNotifPrimeHandler(fn: NotifPrimeHandler | null): void {
  handler = fn;
}

/** Opens the prime sheet immediately (no durability check). Returns false if no handler. */
export function requestNotifPrime(): boolean {
  if (!handler) return false;
  handler();
  return true;
}

/** Fire-and-forget: open the prime once ever. Marks primed so it never repeats. */
export async function maybeRequestNotifPrime(): Promise<void> {
  const already = await AsyncStorage.getItem(FLAG);
  if (already) return;
  if (requestNotifPrime()) {
    await AsyncStorage.setItem(FLAG, "1");
  }
}

/** Marks primed without showing (e.g., if the user already granted elsewhere). */
export async function markNotifPrimed(): Promise<void> {
  await AsyncStorage.setItem(FLAG, "1");
}
```

Create `apps/mobile/src/components/NotifPrimeSheet.tsx`:

```tsx
// Contextual push-permission prime, shown once after the first save. Asking at a
// value moment ("we just saved this — want a heads-up when its happy hour
// starts?") converts far better than an upfront cold prompt.
import * as Notifications from "expo-notifications";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type NotifPrimeSheetProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function NotifPrimeSheet({ visible, onDismiss }: NotifPrimeSheetProps) {
  const enable = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // permission denial / unavailable — nothing to do; token registration
      // (useConfigPushNotifications) will reflect the real status on next launch.
    } finally {
      onDismiss();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Get a heads-up before it starts?</Text>
          <Text style={styles.body}>
            We'll ping you when happy hour starts at the spots you save. No spam — just the deals you care about.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => void enable()}
          >
            <Text style={styles.primaryText}>Enable alerts</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onDismiss}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  primary: {
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.9 },
  secondary: { alignItems: "center", paddingVertical: spacing.sm },
  secondaryText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
});
```

In `apps/mobile/src/hooks/useUserFollowedVenues.ts`, import the trigger near the other `../lib` imports:

```ts
import { maybeRequestNotifPrime } from "../lib/notifPrime";
```

In `toggleFollow`, after a successful signed-in **new follow** (the branch that runs `await load(); return { error: null };` for the insert path), fire the prime. Locate the success tail of the insert path and change it from:

```ts
      setState((prev) => ({
        ...prev,
        savingVenueId: null,
      }));
      await load();
      return { error: null };
```

to:

```ts
      setState((prev) => ({
        ...prev,
        savingVenueId: null,
      }));
      await load();
      if (!isFollowing) void maybeRequestNotifPrime(); // first-save value moment
      return { error: null };
```

(`isFollowing` is already computed at the top of `toggleFollow`; a new follow is `!isFollowing`. `maybeRequestNotifPrime` is internally once-only, so repeated saves are safe.)

In `apps/mobile/App.tsx`, add imports:

```ts
import { NotifPrimeSheet } from "./src/components/NotifPrimeSheet";
import { setNotifPrimeHandler } from "./src/lib/notifPrime";
```

Add state next to `signupKind` (~line 203):

```ts
  const [notifPrimeVisible, setNotifPrimeVisible] = useState(false);
```

Register the handler in a `useEffect` next to the `setSignInRequestHandler` effect (~line 223):

```ts
  useEffect(() => {
    setNotifPrimeHandler(() => setNotifPrimeVisible(true));
    return () => setNotifPrimeHandler(null);
  }, []);
```

Render `<NotifPrimeSheet>` alongside the existing `<EarnedSignupSheet>` in **both** guest-browse return blocks and the authenticated block. The cleanest single insertion point: render it once just inside the `AuthenticatedApp`'s sibling. Since the sheet is a `Modal` it can be mounted anywhere that is always-rendered when a session may exist; add it to the authenticated return:

```tsx
  return (
    <>
      <AuthenticatedApp session={session} />
      <NotifPrimeSheet visible={notifPrimeVisible} onDismiss={() => setNotifPrimeVisible(false)} />
    </>
  );
```

(The first save requires a signed-in user, which always lands in the authenticated branch, so mounting the sheet there is sufficient.)

- [ ] **Step 4: Run test + typecheck**

Run: `node --test test/onboarding-phase3.test.mjs`
Expected: PASS (6 tests).
Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify "lazy profile" needs no work**

Read `apps/mobile/src/components/PostSignupCapture.tsx`: confirm signup collects only the `@handle` (+ optional referrer) and routes straight to `AuthenticatedApp` — display name / bio / city are editable later on the Profile screen. This satisfies the design's "lazy profile" with no new code. No commit; this is a confirmation step.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/notifPrime.ts apps/mobile/src/components/NotifPrimeSheet.tsx apps/mobile/src/hooks/useUserFollowedVenues.ts apps/mobile/App.tsx test/onboarding-phase3.test.mjs
git commit -m "feat(mobile): contextual push-notification prime after first save"
```

---

### Task 7: Full-suite green + final review

**Files:** none (verification + final review).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test` (which is `npm run build:shared && node --test test/*.test.mjs`)
Expected: 0 failures, including all `onboarding-phase3` assertions.

- [ ] **Step 2: Typecheck the mobile app**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Final code review**

Dispatch a final reviewer over the whole Phase-3 diff. Confirm:
- Guest vibes seed the feed filter for guests only and never override a signed-in user's manual filter.
- The persist hook is single-fire and clears the stash (no duplicate `interests` writes).
- The notif prime is once-only (durable flag) and fires only on a real new save.
- `vibeTagMap` slugs all exist in the live `approved_tags` taxonomy (`dive-bar`, `cocktail-bar`, `patio`, `rooftop`, `sports-bar`, `late-night`, `brewery`, `margaritas`, `wine-bar`).

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch.

---

## Self-Review

**1. Spec coverage (design §7, §9 Phase 3):**
- "vibes/pref persistence" → Tasks 1–4 (map + stash + completion write + persist-on-signup to `interests`). ✓
- "for guests they drive the local feed filter" → Task 5. ✓
- "Contextual notif prime" → Task 6. ✓
- "lazy profile" → Task 6 Step 5 (verified already satisfied by Phase 2). ✓
- Hood/location persistence → consciously deferred (no neighborhood column) — documented in Scope. ✓ (gap is intentional, not an oversight)

**2. Placeholder scan:** No "TBD"/"handle edge cases"/bare prose steps — every code step has complete code. ✓

**3. Type consistency:** `GuestSelections = { hood: string | null; vibes: string[] }` is produced by `PreFeedOnboarding.onDone` (Task 3), stored/returned by `guestSelections.ts` (Task 2), and consumed by `useGuestSelectionPersist` (Task 4) and `HomeScreen` (Task 5). `vibesToTagSlugs(vibes: string[]): string[]` (Task 1) is used identically in Tasks 4 and 5. `setNotifPrimeHandler`/`requestNotifPrime`/`maybeRequestNotifPrime` (Task 6) names match across `notifPrime.ts`, `App.tsx`, and `useUserFollowedVenues.ts`. ✓
