# HappiTime — Engineering TODOs

Immediate and near-term action items. For deferred or larger items see BACKLOG.md.

---

## Immediate

- [ ] **`HappyHourDetailScreen.tsx`** — Fix `colors.textTertiary` (TS2339). Replace with `colors.inputPlaceholder` or add `textTertiary` to the color palette. Two occurrences at lines 508 and 516.

- [ ] **`venue_subscriptions` / `user_plans` types** — Run `npm run supabase:gen-types` after confirming these tables exist in Supabase. Removes the `as any` casts in `shared-api/plans.ts` and `admin-plans-actions.ts`.

---

## Near-term

- [ ] **Add `SUPABASE_SERVICE_ROLE_KEY` to local `.env.local`** for admin features and the events ingest endpoint to work in development.

- [ ] **Add `ADMIN_EMAILS` to `.env.local`** — without it, all admin checks throw "Unauthorized". Comma-separated list of admin email addresses.

- [ ] **Add `EVENTS_INGEST_API_KEY` to `.env.local`** — required for `/api/events/ingest` to accept requests.

- [ ] **Wire unread badge in Activity tab** — see BACKLOG.md: "Activity tab unread badge". `unreadCount` is hardcoded to `null` in `navigation/index.tsx`.

- [ ] **`ConfirmDeleteForm.tsx`** — Replace `window.confirm()` with shadcn `<Dialog>` for accessibility. See BACKLOG.md.

- [ ] **`access-actions.ts`** — Import `toStr` from `@/utils/form` to eliminate the local copy. Low risk, file-local change.

- [ ] **`apps/mobile/src/screens/HappyHourDetailScreen.tsx`** — VenuePreviewScreen no longer uses `getMediaPublicUrl` (it was removed from `useVenueMedia`). Confirm no other screens import the function; clean up any lingering import attempts.
