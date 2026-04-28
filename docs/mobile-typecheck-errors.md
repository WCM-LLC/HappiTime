# Mobile Typecheck Errors (pre-existing as of 2026-04-27)

21 errors across 6 files. All pre-date the Phase 1 stabilization work.

---

## `src/hooks/useFriendSuggestions.ts` — 6 errors

Root cause: Supabase query selects `visited_at` from `venue_visits`, but that column does not exist in the generated types. The type system surfaces a `SelectQueryError` instead of the expected row shape, so all downstream property accesses (`.visited_at`, `.venue_id`, `.user_id`, `.venue`) are flagged.

**Fix:** Either add `visited_at` to the `venue_visits` table (via migration) or rewrite the query to use the correct column name.

| Line | Error |
|------|-------|
| 79 | `Property 'visited_at' does not exist on SelectQueryError` |
| 86 | `Property 'venue_id' does not exist on SelectQueryError` |
| 94 | `Property 'user_id' does not exist on SelectQueryError` |
| 97 | `Property 'venue' does not exist on SelectQueryError` |
| 99 | `Property 'venue_id' does not exist on SelectQueryError` |
| 101 | `Property 'visited_at' does not exist on SelectQueryError` |

---

## `src/hooks/useUserFollowers.ts` — 4 errors

Root cause: Supabase query selects `id` from `user_follows`, but that column does not exist in the generated types. The schema has `follower_id`, `following_user_id`, `status`, `created_at` — no `id` PK.

**Fix:** Either add an `id` column to `user_follows` (migration) or change the query/downstream code to use `follower_id` as the identifier.

| Line | Error |
|------|-------|
| 73 | `Conversion of SelectQueryError[] to PendingRequest[]` (type overlap) |
| 140 | `Argument '"id"' not assignable to "created_at" \| "status" \| "follower_id" \| "following_user_id"` |
| 155 | Same as 140 |
| 174 | Same cast error as 73 |

---

## `src/hooks/useVisitRating.ts` — 1 error

| Line | Error |
|------|-------|
| 63 | `TS2769: No overload matches this call` — likely a Supabase insert/update with wrong column shape |

---

## `src/hooks/useVisitTracker.ts` — 2 errors

| Line | Error |
|------|-------|
| 36 | `TS2769: No overload matches this call` — Supabase call with wrong column shape (possibly `user_id` field mismatch) |
| 109 | `TaskManagerTaskExecutor<unknown>` expects `Promise<any>` return; executor callback returns `void` |

---

## `src/screens/HappyHourDetailScreen.tsx` — 2 errors

Root cause: `colors.textTertiary` referenced but the color token does not exist in the theme object.

**Fix:** Add `textTertiary` to the theme definition, or replace usages with `colors.textMuted`.

| Line | Error |
|------|-------|
| 508 | `Property 'textTertiary' does not exist on type { … }` |
| 516 | Same |

---

## `src/screens/VenuePreviewScreen.tsx` — 6 errors

Root cause: Two issues in the same file.
1. `getMediaPublicUrl` was removed (or never exported) from `useVenueMedia` hook.
2. The hook's return shape changed — callers expect `{ data, media, loading }` but hook returns `{ media, loading }`.
3. Implicit `any` parameters because TypeScript can't infer types after the `data` property access fails.

**Fix:** Export `getMediaPublicUrl` from `useVenueMedia`, or update the screen to use the correct API. Remove the `.data` unwrap — use `media` directly.

| Line | Error |
|------|-------|
| 18 | `Module '"../hooks/useVenueMedia"' has no exported member 'getMediaPublicUrl'` |
| 58 | `Property 'data' does not exist on { media: VenueMediaItem[]; loading: boolean; }` |
| 70 | Implicit `any` on `m`, `a`, `b` parameters |
| 98 | Implicit `any` on `img` parameter |

---

## Summary table

| File | Error count | Root cause |
|------|-------------|------------|
| `useFriendSuggestions.ts` | 6 | Schema mismatch: `venue_visits.visited_at` not in DB types |
| `useUserFollowers.ts` | 4 | Schema mismatch: `user_follows.id` not in DB types |
| `useVisitRating.ts` | 1 | Supabase call shape mismatch |
| `useVisitTracker.ts` | 2 | Supabase call shape mismatch + async executor type |
| `HappyHourDetailScreen.tsx` | 2 | Missing `textTertiary` color token |
| `VenuePreviewScreen.tsx` | 6 | Removed/missing `getMediaPublicUrl` export + hook return shape changed |
| **Total** | **21** | |
