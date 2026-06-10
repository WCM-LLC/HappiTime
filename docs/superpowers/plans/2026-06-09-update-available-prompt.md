# "Update Available" Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On app-open, show a dismissible modal (with version + changelog + Update button) when a newer app version is published in the store; support a non-dismissible `is_critical` flag.

**Architecture:** A `public.app_releases` table read through a `SECURITY DEFINER` RPC `get_latest_release(platform)`. On mount of the authenticated shell, a `useUpdatePrompt()` hook compares the latest published version to the running `app.json` version (via `expo-constants`) using a pure `isNewerVersion` helper, honoring per-version dismissal in `AsyncStorage` (critical bypasses). An `UpdateAvailableModal` renders the result.

**Tech Stack:** React Native / Expo (expo-constants ~18, @react-native-async-storage/async-storage 2.2.0), Supabase Postgres + RPC, `node --test` for the pure helper. JS-only → OTA-shippable.

Spec: `docs/superpowers/specs/2026-06-09-update-available-prompt-design.md`

---

### Task 1: `isNewerVersion` pure helper

**Files:**
- Test: `test/is-newer-version.test.mjs`
- Create: `apps/mobile/src/lib/isNewerVersion.mjs`
- Create: `apps/mobile/src/lib/isNewerVersion.d.ts`

- [ ] **Step 1: Write the failing test**

`test/is-newer-version.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { isNewerVersion } from "../apps/mobile/src/lib/isNewerVersion.mjs";

test("true when latest patch is higher", () => {
  assert.equal(isNewerVersion("1.0.4", "1.0.3"), true);
});
test("numeric (not lexical) comparison", () => {
  assert.equal(isNewerVersion("1.0.10", "1.0.9"), true);
});
test("false when equal", () => {
  assert.equal(isNewerVersion("1.0.4", "1.0.4"), false);
});
test("false when latest is older", () => {
  assert.equal(isNewerVersion("1.0.3", "1.0.4"), false);
});
test("treats missing segments as zero", () => {
  assert.equal(isNewerVersion("1.1", "1.0.9"), true);
  assert.equal(isNewerVersion("1.0", "1.0.0"), false);
});
test("malformed or non-string input is not newer (fail safe)", () => {
  assert.equal(isNewerVersion("1.0.x", "1.0.0"), false);
  assert.equal(isNewerVersion("", "1.0.0"), false);
  assert.equal(isNewerVersion(null, "1.0.0"), false);
  assert.equal(isNewerVersion("1.0.1", undefined), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/is-newer-version.test.mjs`
Expected: FAIL — `Cannot find module '.../isNewerVersion.mjs'`

- [ ] **Step 3: Write minimal implementation**

`apps/mobile/src/lib/isNewerVersion.mjs`:
```js
// src/lib/isNewerVersion.mjs
// Pure dotted-numeric version comparison. .mjs + colocated .d.ts so `node --test`
// can EXECUTE it on CI while the app gets types (same pattern as parseVenueLink).
// Fail-safe: malformed input returns false so a bad value never triggers a prompt.

function parse(v) {
  if (typeof v !== "string") return null;
  const parts = v.trim().split(".");
  if (parts.length === 0 || parts.length > 3) return null;
  const nums = [0, 0, 0];
  for (let i = 0; i < parts.length; i++) {
    if (!/^\d+$/.test(parts[i])) return null;
    nums[i] = parseInt(parts[i], 10);
  }
  return nums;
}

export function isNewerVersion(latest, running) {
  const a = parse(latest);
  const b = parse(running);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}
```

`apps/mobile/src/lib/isNewerVersion.d.ts`:
```ts
// Types for isNewerVersion.mjs (plain ESM impl; declaration gives the app types).
export declare function isNewerVersion(latest: unknown, running: unknown): boolean;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/is-newer-version.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add test/is-newer-version.test.mjs apps/mobile/src/lib/isNewerVersion.mjs apps/mobile/src/lib/isNewerVersion.d.ts
git commit -m "feat(mobile): isNewerVersion helper for update prompt (TDD)"
```

---

### Task 2: `app_releases` table + `get_latest_release` RPC

**Files:**
- Create: `supabase/migrations/20260609210000_app_releases.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260609210000_app_releases.sql`:
```sql
-- Store-version release notes for the in-app "update available" prompt.
create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios','android','all')),
  version text not null,
  changelog text[] not null default '{}',
  is_critical boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.app_releases enable row level security;
-- No public RLS policies: all reads go through the SECURITY DEFINER RPC below;
-- writes are service-role/admin only.

-- Latest published release for a platform ('all' rows apply to every platform).
create or replace function public.get_latest_release(p_platform text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', r.version,
    'changelog', r.changelog,
    'is_critical', r.is_critical
  )
  from public.app_releases r
  where r.is_published = true
    and (r.platform = p_platform or r.platform = 'all')
  order by r.published_at desc
  limit 1;
$$;

revoke all on function public.get_latest_release(text) from public;
grant execute on function public.get_latest_release(text) to anon, authenticated;
```

- [ ] **Step 2: Dry-run against prod (ROLLBACK — verify, do not persist)**

Run via Supabase MCP `execute_sql` (project `ujflcrjsiyhofnomurco`):
```sql
BEGIN;
-- (paste the table + function DDL from Step 1)
INSERT INTO public.app_releases (platform, version, changelog, is_critical, is_published)
VALUES ('all', '1.0.4', ARRAY['Faster venue pages','Avatar upload fix'], false, true),
       ('ios', '1.0.3', ARRAY['old'], false, true);          -- older, should lose
SELECT jsonb_pretty(public.get_latest_release('ios')) AS ios,
       public.get_latest_release('android') AS android,
       public.get_latest_release('ios') IS NOT NULL AS has_row;
ROLLBACK;
```
Expected: `ios` returns the `1.0.4` 'all' row (newer published_at) with version+changelog+is_critical; `android` returns the same 'all' row; `has_row` true. Confirm no error.

- [ ] **Step 3: Commit (deploys to prod on merge via Supabase DB Deploy)**

```bash
git add supabase/migrations/20260609210000_app_releases.sql
git commit -m "feat(db): app_releases table + get_latest_release RPC"
```

---

### Task 3: Shared store links + `useUpdatePrompt` hook

**Files:**
- Create: `apps/mobile/src/lib/storeLinks.ts`
- Create: `apps/mobile/src/hooks/useUpdatePrompt.ts`
- Modify: `apps/mobile/src/screens/FavoritesScreen.tsx` (reuse the shared constants — DRY)

- [ ] **Step 1: Create the shared store links**

`apps/mobile/src/lib/storeLinks.ts`:
```ts
import { Platform } from "react-native";

// Canonical store URLs. iOS id 6757933269 matches eas.json ascAppId + the directory app
// (InviteScreen historically used a stale id 6744873669 — do not copy that).
export const APP_STORE_URL = "https://apps.apple.com/us/app/happitime/id6757933269";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.happitime";

export function storeUrl(): string {
  return Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
}
```

- [ ] **Step 2: Create the hook**

`apps/mobile/src/hooks/useUpdatePrompt.ts`:
```ts
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../api/supabaseClient";
import { isNewerVersion } from "../lib/isNewerVersion";
import { storeUrl } from "../lib/storeLinks";

export type AppRelease = {
  version: string;
  changelog: string[];
  is_critical: boolean;
};

const dismissKey = (version: string) => `update_prompt_dismissed:${version}`;

/**
 * On mount (login / app-open), surfaces the latest published store release when it is
 * newer than the running build. Never throws — any failure simply yields no prompt.
 */
export function useUpdatePrompt() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const running = Constants.expoConfig?.version;
        if (!running) return;
        // Cast: generated DB types predate this RPC (migration 20260609210000).
        const { data, error } = await (supabase as any).rpc("get_latest_release", {
          p_platform: Platform.OS,
        });
        if (cancelled || error || !data) return;
        const rel = data as AppRelease;
        if (!isNewerVersion(rel.version, running)) return;
        if (!rel.is_critical) {
          const dismissed = await AsyncStorage.getItem(dismissKey(rel.version));
          if (cancelled || dismissed) return;
        }
        setRelease(rel);
        setVisible(true);
      } catch {
        // never block the app on the update check
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(async () => {
    if (release && !release.is_critical) {
      try {
        await AsyncStorage.setItem(dismissKey(release.version), "1");
      } catch {
        // ignore persistence failure
      }
    }
    setVisible(false);
  }, [release]);

  const openStore = useCallback(() => {
    void Linking.openURL(storeUrl());
  }, []);

  return { release, visible, dismiss, openStore };
}
```

- [ ] **Step 3: DRY — point FavoritesScreen at the shared constants**

In `apps/mobile/src/screens/FavoritesScreen.tsx`, remove the two local consts:
```ts
const HAPPITIME_APP_STORE_URL = "https://apps.apple.com/us/app/happitime/id6757933269";
const HAPPITIME_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.happitime";
```
Add to the imports near the other `../lib` imports:
```ts
import { APP_STORE_URL as HAPPITIME_APP_STORE_URL, PLAY_STORE_URL as HAPPITIME_PLAY_STORE_URL } from "../lib/storeLinks";
```
(Aliasing keeps the existing `handleShareOutside` references unchanged.)

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors in `useUpdatePrompt.ts`, `storeLinks.ts`, `FavoritesScreen.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/storeLinks.ts apps/mobile/src/hooks/useUpdatePrompt.ts apps/mobile/src/screens/FavoritesScreen.tsx
git commit -m "feat(mobile): useUpdatePrompt hook + shared store links"
```

---

### Task 4: `UpdateAvailableModal` + mount in the app shell

**Files:**
- Create: `apps/mobile/src/components/UpdateAvailableModal.tsx`
- Modify: `apps/mobile/src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Create the modal**

`apps/mobile/src/components/UpdateAvailableModal.tsx`:
```tsx
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { useUpdatePrompt } from "../hooks/useUpdatePrompt";

export const UpdateAvailableModal: React.FC = () => {
  const { release, visible, dismiss, openStore } = useUpdatePrompt();
  if (!release) return null;
  const critical = release.is_critical;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={critical ? () => {} : dismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Update available</Text>
          <Text style={styles.version}>Version {release.version}</Text>
          <ScrollView style={styles.changelogWrap} contentContainerStyle={styles.changelog}>
            {release.changelog.map((item, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.bullet}>{"•"}</Text>
                <Text style={styles.item}>{item}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={openStore} style={({ pressed }) => [styles.update, pressed && styles.pressed]}>
            <Text style={styles.updateText}>Update</Text>
          </Pressable>
          {!critical ? (
            <Pressable onPress={dismiss} style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  version: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: spacing.xs },
  changelogWrap: { maxHeight: 220, marginTop: spacing.md },
  changelog: { gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm },
  bullet: { color: colors.primary, fontSize: 15, lineHeight: 21 },
  item: { color: colors.text, fontSize: 15, lineHeight: 21, flex: 1 },
  update: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  updateText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  later: { marginTop: spacing.sm, paddingVertical: spacing.sm, alignItems: "center" },
  laterText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.85 },
});
```

- [ ] **Step 2: Mount it in the authenticated shell**

In `apps/mobile/src/navigation/AppNavigator.tsx`:
- Add import near the other component imports:
```ts
import { UpdateAvailableModal } from "../components/UpdateAvailableModal";
```
- Wrap the returned `<NavigationContainer>…</NavigationContainer>` in a fragment with the modal as a sibling so it overlays any screen:
```tsx
  return (
    <>
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        {/* …existing Stack.Navigator unchanged… */}
      </NavigationContainer>
      <UpdateAvailableModal />
    </>
  );
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors in `UpdateAvailableModal.tsx` / `AppNavigator.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/UpdateAvailableModal.tsx apps/mobile/src/navigation/AppNavigator.tsx
git commit -m "feat(mobile): UpdateAvailableModal mounted in app shell"
```

---

### Task 5: Verify end-to-end + open PR

- [ ] **Step 1: Run the full mobile test suite**

Run: `node --test test/*.test.mjs`
Expected: all pass (includes the new `is-newer-version` tests).

- [ ] **Step 2: Manual verification path (document in the PR)**

After merge (migration deployed), insert a release row with a version ABOVE the running build to see the prompt, then a row equal to confirm it hides:
```sql
INSERT INTO public.app_releases (platform, version, changelog, is_published)
VALUES ('all', '1.0.5', ARRAY['What''s new line 1','Line 2'], true);
```
Reopen the app → modal shows "Version 1.0.5" + changelog. Tap Later → dismissed; reopen → stays hidden (same version). Set `is_critical=true` on a higher version → "Later" gone, non-dismissible.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/update-available-prompt
gh pr create --base master --title "feat(mobile): in-app 'update available' prompt" --body "<summary + manual-verification steps>"
```

---

## Self-Review

- **Spec coverage:** app_releases table + RPC (Task 2 ✓), isNewerVersion (Task 1 ✓), useUpdatePrompt with dismissal + critical (Task 3 ✓), modal with Update/Later + hidden-when-critical (Task 4 ✓), shared store links + FavoritesScreen DRY (Task 3 ✓), unit tests (Task 1) + RPC dry-run (Task 2) + e2e manual (Task 5 ✓). OTA-shippable (no native dep) ✓.
- **Placeholders:** none — all code is concrete.
- **Type consistency:** `AppRelease { version, changelog, is_critical }` defined in Task 3, consumed identically in Task 4; RPC returns those exact keys (Task 2); `isNewerVersion(latest, running)` signature consistent Task 1↔3; `storeUrl()` defined Task 3 used Task 3 hook.
