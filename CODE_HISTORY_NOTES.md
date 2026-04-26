# HappiTime — Code History Notes

Long comments, historical notes, and implementation rationale removed from source files during the cleanup of 2026-04-25. Each entry records the source file, context, and original content so the intent is not lost.

---

## `apps/web/src/actions/venue-actions.ts`

### `toTimeStr` function (removed)

```typescript
function toTimeStr(v: FormDataEntryValue | null | undefined) {
  // input[type=time] usually returns "HH:MM"
  // Postgres time can be "HH:MM:SS"
  // We store "HH:MM" or "HH:MM:SS" fine; but keep it clean:
  const s = toStr(v);
  return s;
}
```

**Why removed:** The function was functionally identical to `toStr(v)` — the intermediate variable `s` is returned unchanged. The comment explained the intent (normalize time strings) but the implementation did not act on it. All call sites were replaced with `toStr()` directly. If time normalization (e.g., always ensuring `HH:MM:SS`) becomes necessary, it should be implemented explicitly rather than as an identity alias.

---

## `apps/web/src/actions/venue-actions.ts` and `event-actions.ts`

### Duplicate form parsing helpers (extracted to `utils/form.ts`)

Both files contained identical copies of:
- `toStr(v)` — coerce FormData value to trimmed string
- `toNullableStr(v)` — return `null` if blank
- `toNumberOrNull(v)` — parse finite number or return `null`
- `redirectWithError(orgId, venueId, error)` — redirect with error query param
- `requireField(formData, key, orgId, venueId, error)` — extract required field or redirect

These are now centralized in `apps/web/src/utils/form.ts`. The `access-actions.ts` file still has its own local `toStr` copy; see TODO.md for cleanup.

---

## `apps/web/src/actions/admin-actions.ts` and `admin-plans-actions.ts`

### Duplicate `assertAdmin` and `getAdminClient` (extracted to `utils/admin.ts`)

Both action files had byte-for-byte identical copies of:

```typescript
async function assertAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email?.toLowerCase() ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length === 0 || !adminEmails.includes(email)) {
    throw new Error('Unauthorized');
  }
}

function getAdminClient() {
  if (getServiceRoleKeyError()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createServiceClient();
}
```

Moved to `apps/web/src/utils/admin.ts` and both action files now import from there.

---

## `apps/web/src/services/notifications.ts`

### Verbose inline TODO comments (condensed)

Three functions (`scheduleLocalNotification`, `cancelLocalNotification`, `registerPushToken`) each had:

```
// TODO: integrate Expo Notifications or native push scheduling in the mobile app.
// TODO: integrate Expo Notifications or Firebase Cloud Messaging.
```

These were consolidated into a single file-level comment and a brief per-function stub note referencing BACKLOG.md. The stubs themselves remain and return `null`/`void`.

---

## `apps/mobile/src/navigation/index.tsx`

### TODO comment on unread badge (reformatted)

Original:
```typescript
const unreadCount: number | null = null;
// TODO: wire unreadCount to activity/notification state.
```

Replaced with an inline placeholder comment and a BACKLOG.md entry ("Activity tab unread badge"). The variable and badge wiring logic are unchanged.

---

## `apps/web/src/queries/` (5 files deleted)

The following files contained only `export {}` and had no importers anywhere in the codebase. They appear to have been scaffolded as query layer stubs but never implemented.

- `happy-hours.ts`
- `menus.ts`
- `members.ts`
- `organizations.ts`
- `venues.ts`

If a query abstraction layer is needed in the future, these can be re-created. The actual data-fetching logic lives in `packages/shared-api/src/` for shared use and in `apps/web/src/actions/` for server actions.

---

## `apps/web/src/components/auth/OauthButtons.tsx` (deleted)

This file contained a single line:
```typescript
export { default } from '../OAuthButtons';
```

It was a re-export of `components/OAuthButtons.tsx` with no callers in the codebase. Removed to avoid import path confusion. The canonical component remains at `components/OAuthButtons.tsx`.
