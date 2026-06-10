# "Update Available" Prompt — Design

**Status:** Approved.
**Date:** 2026-06-09
**Goal:** On login / app-open, if a newer app version is available in the store, show a
dismissible modal listing the version number and changelog, with an "Update" button to the
store. Supports an `is_critical` flag for non-dismissible forced updates.

**OTA-shippable:** uses only JS + existing deps (`@supabase/supabase-js`,
`@react-native-async-storage/async-storage` 2.2.0, `expo-constants` ~18.0.13, `Linking`).
No new native module → can reach 1.0.4 builds via `eas update` without a new build.

## Data model — `public.app_releases` (new migration)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `platform` | text | check in `('ios','android','all')` |
| `version` | text | display + compare, e.g. `'1.0.4'` |
| `changelog` | text[] | bullet points |
| `is_critical` | boolean | default false → non-dismissible |
| `is_published` | boolean | default false → staging before release |
| `published_at` | timestamptz | default now() |
| `created_at` | timestamptz | default now() |

**Read path:** `SECURITY DEFINER` RPC **`get_latest_release(p_platform text)`** — returns the
most recent **published** row matching `platform = p_platform OR platform = 'all'`
(ordered by `published_at desc`), as jsonb `{ version, changelog, is_critical }` or null.
`EXECUTE` to `anon, authenticated`; bypasses RLS so the table needs no broad read policy.
Writes stay owner/service-only (no public grant). Mirrors `get_shared_itinerary`.

**Authoring:** you insert one row per release (SQL / Supabase MCP). No admin UI (YAGNI).

## Client

### `isNewerVersion(latest, running)` — pure helper (`src/lib/isNewerVersion.mjs` + `.d.ts`)
Parses dotted numeric versions into `[major, minor, patch]` and returns `true` iff `latest`
is strictly greater. Tolerates missing segments (`'1.1' → [1,1,0]`) and returns `false` for
malformed/empty input (fail safe → no prompt). Unit-tested via `node --test`.

### `useUpdatePrompt()` hook
Runs once on mount (the authenticated app shell, so it fires on login / app-open):
1. `const running = Constants.expoConfig?.version` (baked from `app.json` at build).
2. `const release = await supabase.rpc('get_latest_release', { p_platform: Platform.OS })`.
3. If no release or `!isNewerVersion(release.version, running)` → done (no prompt).
4. If `release.is_critical` → show (always). Else check
   `AsyncStorage.getItem('update_prompt_dismissed:' + release.version)`; show only if not set.
5. Exposes `{ release, visible, dismiss, openStore }`. `dismiss()` sets the AsyncStorage key
   (no-op for critical) and hides. `openStore()` opens the platform store URL.
6. All errors swallowed → never blocks the app.

### `UpdateAvailableModal`
React Native `Modal`, themed like existing modals (FavoritesScreen sheet / colors):
- Title **"Update available"**, subtitle **"Version {version}"**.
- Bulleted changelog list.
- **"Update"** → `openStore()`.
- **"Later"** → `dismiss()`; **hidden when `is_critical`** (and backdrop/back press disabled).

Mounted in the authenticated tree (e.g. `AppNavigator`/`App.tsx`), rendered above the
navigator so it overlays any screen.

### Shared store links — `src/lib/storeLinks.ts`
Extract the App Store / Play URLs (currently duplicated in `FavoritesScreen.tsx`, and
inconsistent with `InviteScreen.tsx` which uses an OLD Apple app id `6744873669`). Canonical:
iOS `id6757933269` (matches eas.json `ascAppId` + the directory app), Android
`com.happitime`. The modal and FavoritesScreen both import from here.

## Error handling
RPC failure, no row, malformed version, AsyncStorage error → render nothing. The prompt is
strictly additive; it must never block login or crash the shell.

## Testing
- **Unit:** `isNewerVersion` — `1.0.4>1.0.3`, `1.0.10>1.0.9`, equal→false, older→false,
  short/missing segments, malformed→false.
- **DB:** `get_latest_release` prod ROLLBACK dry-run (published vs unpublished; platform vs
  'all'; critical flag passthrough; no-row→null).
- Modal/hook wired; manually verifiable by inserting a row with `version` above the running
  build and reopening the app.

## Out of scope (YAGNI)
- Admin UI for `app_releases` (insert via SQL for now).
- `min_supported_version` (force-below-X) — `is_critical` covers forced updates.
- OTA/JS-update awareness — this is strictly about store (native) versions.
