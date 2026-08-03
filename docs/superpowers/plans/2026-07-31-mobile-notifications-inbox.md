# Mobile Notifications Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every push the platform sends also lands as a row in a new `user_notifications` table, surfaced in a "Notifications" segment on the mobile Activity tab with unread badge, mark-read, and tap-through routing — with all message copy redesigned to a consistent voice.

**Architecture:** One recipient-scoped table written by the six edge-function send paths through a shared insert-then-push helper (`_shared/notify.ts`). Recipient resolution flips user-first (token-less users still get inbox rows). Message copy consolidates into one pure module (`_shared/notification-copy.mjs`) with locked strings and voice-rule tests. Mobile reads the table via a new `useUserNotifications` hook; taps route through the existing `resolveNotificationTarget` with a small bridge for the `visit_rating` modal.

**Tech Stack:** Supabase (Postgres migration, Deno edge functions), React Native (Expo), `node --test` for CI tests, `deno check --no-config` for edge-function typechecking.

**Spec:** `docs/superpowers/specs/2026-07-29-mobile-notifications-inbox-design.md` (PR #134 branch `docs/notifications-inbox-spec` — merge it or cherry-pick the spec into this feature branch first).

## Global Constraints

- **OTA is OFF** — mobile UI code merges now but only ships in the next store build. Backend (migration + functions) ships immediately; rows accumulate until the app catches up. This ordering is per spec and safe.
- **Migrations auto-apply on master merge** (Supabase DB Deploy). The migration must be correct the first time.
- **Grants trap (repo-wide):** RLS alone is insufficient after the lockdown migrations. New tables need explicit `GRANT` to `authenticated`, and the update grant here is **column-scoped to `read_at`**.
- **CI runs `node --test test/*.test.mjs` at repo root on Node 20.** Mobile/deno code is validated locally: `deno check --no-config <fn>/index.ts` and `npx tsc --noEmit` in `apps/mobile`.
- **`data` payloads must mirror the existing push `data` contract exactly** (`happy_hour`, `event`, `venue`, `friend`, `itinerary`, `visit_rating`) so `resolveNotificationTarget` needs zero new routing code. Do not edit `apps/mobile/src/lib/notificationTarget.mjs`.
- **America/Chicago for all user-facing times** (existing test `upcoming-push-schedule.test.mjs` asserts the literal string `America/Chicago` stays in `notify-upcoming-happy-hours/index.ts`).
- **Locked copy:** `send-venue-digest` subject format and `_shared/scan-message.mjs` venue-team copy are locked by existing tests — do not change them.
- **Branch:** create `feat/notifications-inbox` from `origin/master` (branch protection: strict + required checks `node`/`supabase-migrations`).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Message Design System (the copy redesign)

The current copy has four defects the redesign fixes:
1. **24-hour times** — "🍹 Happy hour starting at 17:00" (KC audience reads 12-hour).
2. **Title/body redundancy** — "🆕 New happy hour at {venue}" / "{venue} just published a new happy hour — check it out!" says the same thing twice; in an inbox (bold title + body beneath) the repetition is glaring.
3. **Relative times that age badly** — "starts soon" is wrong the moment the row is read a day later. Absolute times ("Starts at 5:00 PM") work in both push and inbox.
4. **Inconsistent emoji** — some titles lead with an emoji, some don't. Rule: consumer-facing titles lead with one emoji acting as the type glyph (the inbox leans on it instead of custom icons); venue-team ops messages (`scan-message.mjs`) deliberately stay plain — the contrast is useful in a shared inbox.

**Voice rules (enforced by tests in Task 2):**
- Title = what happened. ≤ 45 chars target, leading emoji, **no trailing period**.
- Body = one short sentence adding what the title doesn't say (never repeats the title's venue/actor). **Ends with a period.**
- Times: absolute, 12-hour, America/Chicago. Never 24-hour, never bare "soon".
- Actor fallback chain: `display_name` → `@handle` → "Someone". Venue fallback: "a venue".

**Locked copy table** (all built by `_shared/notification-copy.mjs`):

| Sender / case | `type` | Title | Body |
|---|---|---|---|
| friend-activity: follow | `friend` | `👋 New follower` | `{actor} started following you.` |
| friend-activity: venue_save | `venue` | `🍸 {actor} saved {venue}` | `See what caught their eye.` |
| friend-activity: itinerary_share | `itinerary` | `📋 {actor} shared an itinerary` | `Open it to start planning.` |
| venue-updates: INSERT | `happy_hour` | `🆕 New happy hour at {venue}` | `Just published — see times and specials.` |
| venue-updates: UPDATE | `happy_hour` | `📝 {venue} updated their happy hour` | `See what changed.` |
| upcoming-happy-hours | `happy_hour` | `🍹 Happy hour at {venue}` | `Starts at {5:00 PM}[ · {label}].` |
| upcoming-events | `event` | `🎟️ {event title}` | `Starts at {5:00 PM} at {venue}.` |
| evaluate-visit-ratings | `visit_rating` | `⭐ How was {venue}?` | `Tap to rate your visit.` |
| track-visit (venue team) | `venue` | *(unchanged — `scan-message.mjs`, locked)* | *(unchanged)* |

## Inbox UI spec (Notifications segment)

- **Placement:** first segment in ActivityScreen's `SegmentedTabs`, and the initial tab (the tab-bar icon is a bell — landing on notifications matches it; Friends is one tap away). *Reversible decision: flip `useState<Tab>("notifications")` back to `"friends"` if the owner prefers.*
- **Row anatomy** (no avatars, no custom icons — the title emoji is the glyph): leading 8px unread dot (`colors.primary`) in a fixed 16px gutter; title row = title (15px, weight 700 unread / 600 read, `colors.text`, 1 line) + `timeAgo` right-aligned (12px, `colors.textMutedLight`); body beneath (13px, `colors.textMuted`, 2-line clamp). Read rows: no dot, weight 600. No background tint — the list stays calm like the rest of ActivityScreen; separators reuse `styles.separator`.
- **Header affordance:** "Mark all read" (13px, weight 600, `colors.primary`), right-aligned above the list, rendered only when `unreadCount > 0`.
- **Empty state:** reuses the existing `emptyState` pattern — title "You're all caught up", text "New followers, happy hours, and shared lists land here."
- **Tap:** optimistic mark-read → `resolveNotificationTarget(row.data)` navigate; `visit_rating` rows call the rating-modal bridge instead.
- **Badge:** unread count on the Activity tab in `AppNavigator.tsx` (`99+` cap), styling copied from the dead `navigation/index.tsx:163` badge style. Refreshes on app foreground (`AppState`), and after any mark-read via a module event bus.

## File map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260731120000_user_notifications.sql` | Create | Table, indexes, RLS, column-scoped grants |
| `supabase/functions/_shared/notification-copy.mjs` | Create | All consumer copy builders + time formatters (pure ESM, Node-testable) |
| `supabase/functions/_shared/notify-recipients.mjs` | Create | Pure recipient dedup/category-gate helper |
| `supabase/functions/_shared/notify.ts` | Create | `sendUserNotifications` — insert rows then push |
| `supabase/functions/{notify-friend-activity,notify-venue-updates,notify-upcoming-happy-hours,notify-upcoming-events,evaluate-visit-ratings,track-visit}/index.ts` | Modify | User-first recipients; delegate to helper |
| `apps/mobile/src/lib/notificationsEvents.ts` | Create | Unread-changed event bus |
| `apps/mobile/src/lib/ratingRequest.ts` | Create | Inbox → visit-rating-modal bridge |
| `apps/mobile/src/hooks/useUserNotifications.ts` | Create | List + unread + markRead/markAllRead |
| `apps/mobile/src/hooks/useUnreadNotificationsBadge.ts` | Create | Badge count (foreground + bus refresh) |
| `apps/mobile/src/screens/ActivityScreen.tsx` | Modify | Notifications segment + rows + tap routing |
| `apps/mobile/src/navigation/AppNavigator.tsx` | Modify | Tab badge |
| `apps/mobile/App.tsx` | Modify | Register rating bridge handler |
| `test/user-notifications-rls.test.mjs` | Create | Static migration guards |
| `test/notification-copy.test.mjs` | Create | Locked strings + voice rules |
| `test/notifications-inbox.test.mjs` | Create | All six senders use the helper; no stray Expo fetches |
| `test/mobile-notifications-inbox.test.mjs` | Create | Mobile wiring static guards |
| `test/venue-scan-notify.test.mjs` | Modify | Update two assertions to the new architecture |

---

### Task 1: `user_notifications` migration + RLS static test

**Files:**
- Create: `supabase/migrations/20260731120000_user_notifications.sql`
- Test: `test/user-notifications-rls.test.mjs`

**Interfaces:**
- Produces: table `public.user_notifications(id, user_id, type, title, body, data, created_at, read_at)`; `authenticated` may `select` own rows and `update` only `read_at` on own rows; inserts are service-role only.

- [ ] **Step 1: Write the failing static test**

```js
// test/user-notifications-rls.test.mjs
//
// Static guards on the user_notifications migration: owner-only RLS, the
// column-scoped read_at grant (repo trap: RLS alone is insufficient after the
// lockdown migrations — authenticated needs explicit grants), and no insert
// path for authenticated (writes are service-role only, via _shared/notify.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mig = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260731120000_user_notifications.sql"),
  "utf8"
);

test("table is recipient-scoped with the spec's columns", () => {
  assert.match(mig, /create table public\.user_notifications/);
  for (const col of ["user_id", "type", "title", "body", "data", "created_at", "read_at"]) {
    assert.match(mig, new RegExp(`\\b${col}\\b`), `missing column ${col}`);
  }
  assert.match(mig, /references auth\.users\(id\) on delete cascade/);
});

test("both indexes exist: newest-first list + unread badge partial", () => {
  assert.match(mig, /on public\.user_notifications \(user_id, created_at desc\)/);
  assert.match(mig, /on public\.user_notifications \(user_id\)\s+where read_at is null/);
});

test("RLS is enabled with owner-only select and update", () => {
  assert.match(mig, /alter table public\.user_notifications enable row level security/);
  assert.match(mig, /for select to authenticated\s+using \(user_id = auth\.uid\(\)\)/);
  assert.match(
    mig,
    /for update to authenticated\s+using \(user_id = auth\.uid\(\)\)\s+with check \(user_id = auth\.uid\(\)\)/
  );
});

test("grants are explicit and the update grant is column-scoped to read_at", () => {
  assert.match(mig, /revoke all on public\.user_notifications from anon, authenticated/);
  assert.match(mig, /grant select on public\.user_notifications to authenticated/);
  assert.match(mig, /grant update \(read_at\) on public\.user_notifications to authenticated/);
});

test("no insert policy or insert grant for authenticated", () => {
  assert.doesNotMatch(mig, /for insert/i);
  assert.doesNotMatch(mig, /grant insert/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/user-notifications-rls.test.mjs`
Expected: FAIL — `ENOENT` (migration file doesn't exist).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260731120000_user_notifications.sql
--
-- Notifications inbox spine (spec: docs/superpowers/specs/2026-07-29-mobile-
-- notifications-inbox-design.md). One row per (recipient, notification);
-- type/data mirror the push payload contract so mobile routing is unchanged.
-- Writes come only from edge functions using the service role.

create table public.user_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

-- Partial index sized for the unread badge count.
create index user_notifications_unread_idx
  on public.user_notifications (user_id) where read_at is null;

alter table public.user_notifications enable row level security;

create policy user_notifications_select_own
  on public.user_notifications
  for select to authenticated
  using (user_id = auth.uid());

-- The update grant below is column-scoped to read_at, so this policy only
-- ever authorizes marking one's own rows read.
create policy user_notifications_update_own
  on public.user_notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.user_notifications from anon, authenticated;
grant select on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/user-notifications-rls.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify the migration applies cleanly against local shadow**

Run: `supabase db reset` (if local stack is running; skip if not — CI's `supabase-migrations` check covers it)
Expected: no errors; `user_notifications` present.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260731120000_user_notifications.sql test/user-notifications-rls.test.mjs
git commit -m "feat(db): user_notifications inbox table with owner-only RLS + read_at-scoped grant"
```

---

### Task 2: Copy module + voice-rule tests

**Files:**
- Create: `supabase/functions/_shared/notification-copy.mjs`
- Test: `test/notification-copy.test.mjs`

**Interfaces:**
- Produces (all return `{ title: string, body: string }`):
  - `followCopy(actorName)`
  - `venueSaveCopy(actorName, venueName)`
  - `itineraryShareCopy(actorName)`
  - `happyHourPublishedCopy(venueName)`
  - `happyHourUpdatedCopy(venueName)`
  - `happyHourStartingCopy(venueName, startClockHHMM, label)` — `startClockHHMM` is the CT wall-clock `"17:00"` string from `happy_hour_windows.start_time`
  - `eventStartingCopy(eventTitle, venueName, startsAtIso)` — `startsAtIso` is the `timestamptz` ISO string
  - `visitRatingCopy(venueName)`
  - `formatCentralClock(hhmm)` → `"5:00 PM"` (pure string math, input is already CT wall clock)
  - `formatCentralInstant(iso)` → `"5:00 PM"` (Intl, `America/Chicago`)

- [ ] **Step 1: Write the failing tests**

```js
// test/notification-copy.test.mjs
//
// Locks the notification copy table and enforces the voice rules:
// titles lead with an emoji and never end with punctuation; bodies are one
// sentence ending with a period; times are absolute 12-hour Central.
import assert from "node:assert/strict";
import test from "node:test";
import {
  followCopy,
  venueSaveCopy,
  itineraryShareCopy,
  happyHourPublishedCopy,
  happyHourUpdatedCopy,
  happyHourStartingCopy,
  eventStartingCopy,
  visitRatingCopy,
  formatCentralClock,
  formatCentralInstant,
} from "../supabase/functions/_shared/notification-copy.mjs";

const ALL = [
  followCopy("Bri Baker"),
  venueSaveCopy("Bri Baker", "Rockhill Grille"),
  itineraryShareCopy("Bri Baker"),
  happyHourPublishedCopy("Rockhill Grille"),
  happyHourUpdatedCopy("Rockhill Grille"),
  happyHourStartingCopy("Rockhill Grille", "17:00", "Patio Hour"),
  eventStartingCopy("Trivia Night", "Rockhill Grille", "2026-07-31T23:00:00.000Z"),
  visitRatingCopy("Rockhill Grille"),
];

test("exact locked strings", () => {
  assert.deepEqual(followCopy("Bri Baker"), {
    title: "👋 New follower",
    body: "Bri Baker started following you.",
  });
  assert.deepEqual(venueSaveCopy("Bri Baker", "Rockhill Grille"), {
    title: "🍸 Bri Baker saved Rockhill Grille",
    body: "See what caught their eye.",
  });
  assert.deepEqual(itineraryShareCopy("Bri Baker"), {
    title: "📋 Bri Baker shared an itinerary",
    body: "Open it to start planning.",
  });
  assert.deepEqual(happyHourPublishedCopy("Rockhill Grille"), {
    title: "🆕 New happy hour at Rockhill Grille",
    body: "Just published — see times and specials.",
  });
  assert.deepEqual(happyHourUpdatedCopy("Rockhill Grille"), {
    title: "📝 Rockhill Grille updated their happy hour",
    body: "See what changed.",
  });
  assert.deepEqual(happyHourStartingCopy("Rockhill Grille", "17:00", "Patio Hour"), {
    title: "🍹 Happy hour at Rockhill Grille",
    body: "Starts at 5:00 PM · Patio Hour.",
  });
  assert.deepEqual(happyHourStartingCopy("Rockhill Grille", "17:00", null), {
    title: "🍹 Happy hour at Rockhill Grille",
    body: "Starts at 5:00 PM.",
  });
  assert.deepEqual(visitRatingCopy("Rockhill Grille"), {
    title: "⭐ How was Rockhill Grille?",
    body: "Tap to rate your visit.",
  });
});

test("event copy formats the instant in Central time", () => {
  // 2026-07-31T23:00:00Z is 6:00 PM America/Chicago (CDT, UTC-5).
  assert.deepEqual(eventStartingCopy("Trivia Night", "Rockhill Grille", "2026-07-31T23:00:00.000Z"), {
    title: "🎟️ Trivia Night",
    body: "Starts at 6:00 PM at Rockhill Grille.",
  });
});

test("voice rules: emoji-led titles, no title punctuation, bodies end with a period", () => {
  for (const { title, body } of ALL) {
    assert.doesNotMatch(title, /[.!]$/, `title "${title}" must not end with punctuation`);
    assert.match(body, /\.$/, `body "${body}" must end with a period`);
    assert.doesNotMatch(title, /^[A-Za-z]/, `title "${title}" must lead with an emoji glyph`);
  }
});

test("voice rules: no 24-hour times anywhere", () => {
  for (const { title, body } of ALL) {
    assert.doesNotMatch(`${title} ${body}`, /\b(?:1[3-9]|2[0-3]):\d{2}\b/, "24h time leaked into copy");
  }
});

test("fallbacks: missing actor and venue names", () => {
  assert.equal(followCopy("").body, "Someone started following you.");
  assert.equal(venueSaveCopy(null, null).title, "🍸 Someone saved a venue");
  assert.equal(visitRatingCopy(undefined).title, "⭐ How was your visit?");
});

test("time formatters", () => {
  assert.equal(formatCentralClock("17:00"), "5:00 PM");
  assert.equal(formatCentralClock("00:30"), "12:30 AM");
  assert.equal(formatCentralClock("12:05"), "12:05 PM");
  assert.equal(formatCentralInstant("2026-01-15T18:00:00.000Z"), "12:00 PM"); // CST, UTC-6
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/notification-copy.test.mjs`
Expected: FAIL — cannot find module `notification-copy.mjs`.

- [ ] **Step 3: Write the module**

```js
// supabase/functions/_shared/notification-copy.mjs
//
// The single voice for consumer-facing notification copy (push + inbox).
// Pure ESM so the Deno edge functions and CI's Node 20 tests both import it
// directly (cf. scan-message.mjs). Venue-team ops copy stays in
// scan-message.mjs on purpose — different audience, plain voice.
//
// Voice rules (locked by test/notification-copy.test.mjs):
//   titles lead with one emoji, no trailing punctuation; bodies are one
//   sentence ending in a period and never repeat the title's subject; times
//   are absolute 12-hour America/Chicago.

const someone = (name) => (name && String(name).trim()) || "Someone";
const aVenue = (name) => (name && String(name).trim()) || "a venue";

// "17:00" (already an America/Chicago wall-clock string) → "5:00 PM"
export function formatCentralClock(hhmm) {
  const [hStr, mStr] = String(hhmm).split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr} ${suffix}`;
}

// ISO instant → "5:00 PM" in America/Chicago (DST-safe via Intl)
export function formatCentralInstant(iso) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso)).toUpperCase();
}

export function followCopy(actorName) {
  return { title: "👋 New follower", body: `${someone(actorName)} started following you.` };
}

export function venueSaveCopy(actorName, venueName) {
  return {
    title: `🍸 ${someone(actorName)} saved ${aVenue(venueName)}`,
    body: "See what caught their eye.",
  };
}

export function itineraryShareCopy(actorName) {
  return {
    title: `📋 ${someone(actorName)} shared an itinerary`,
    body: "Open it to start planning.",
  };
}

export function happyHourPublishedCopy(venueName) {
  return {
    title: `🆕 New happy hour at ${aVenue(venueName)}`,
    body: "Just published — see times and specials.",
  };
}

export function happyHourUpdatedCopy(venueName) {
  return {
    title: `📝 ${aVenue(venueName)} updated their happy hour`,
    body: "See what changed.",
  };
}

export function happyHourStartingCopy(venueName, startClockHHMM, label) {
  const suffix = label && String(label).trim() ? ` · ${String(label).trim()}` : "";
  return {
    title: `🍹 Happy hour at ${aVenue(venueName)}`,
    body: `Starts at ${formatCentralClock(startClockHHMM)}${suffix}.`,
  };
}

export function eventStartingCopy(eventTitle, venueName, startsAtIso) {
  return {
    title: `🎟️ ${eventTitle}`,
    body: `Starts at ${formatCentralInstant(startsAtIso)} at ${aVenue(venueName)}.`,
  };
}

export function visitRatingCopy(venueName) {
  const name = (venueName && String(venueName).trim()) || "your visit";
  return { title: `⭐ How was ${name}?`, body: "Tap to rate your visit." };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/notification-copy.test.mjs`
Expected: PASS (6 tests). Note `formatCentralInstant` uses `.toUpperCase()` because some ICU builds emit "pm"; the test locks "PM".

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/notification-copy.mjs test/notification-copy.test.mjs
git commit -m "feat(notifications): single-voice copy module with locked strings and 12-hour Central times"
```

---

### Task 3: Recipient helper + `sendUserNotifications`

**Files:**
- Create: `supabase/functions/_shared/notify-recipients.mjs`
- Create: `supabase/functions/_shared/notify.ts`
- Test: `test/notifications-inbox.test.mjs` (recipient-helper unit tests only in this task; sender static guards are appended in Task 8)

**Interfaces:**
- Consumes: `sendExpoPush` from `_shared/expo-push.ts` (Task-independent, exists).
- Produces:
  - `categoryGatedRecipients(userIds: string[], prefRows: {user_id, [key]: boolean}[], categoryKey: string | null): { userId: string }[]` — dedups, drops falsy ids, drops users whose pref row has `prefRows[categoryKey] === false` (missing row = opted in). `categoryKey === null` skips gating.
  - `sendUserNotifications(supabase, recipients: { userId: string }[], msg: { type, title, body, data? }): Promise<{ inserted: number, pushed: number }>` — inserts inbox rows first (service role), then pushes to recipients with a valid token and `notifications_push !== false`. Never throws.

- [ ] **Step 1: Write the failing recipient-helper tests**

```js
// test/notifications-inbox.test.mjs
//
// (1) Unit tests for the pure recipient gate. (2) [Added in Task 8] static
// guards that all six send paths route through _shared/notify.ts.
import assert from "node:assert/strict";
import test from "node:test";
import { categoryGatedRecipients } from "../supabase/functions/_shared/notify-recipients.mjs";

test("dedups ids and drops falsy ones", () => {
  assert.deepEqual(
    categoryGatedRecipients(["a", "a", null, "", "b"], [], "notifications_friend_activity"),
    [{ userId: "a" }, { userId: "b" }]
  );
});

test("drops users who disabled the category; missing pref row = opted in", () => {
  const prefs = [
    { user_id: "a", notifications_friend_activity: false },
    { user_id: "b", notifications_friend_activity: true },
  ];
  assert.deepEqual(
    categoryGatedRecipients(["a", "b", "c"], prefs, "notifications_friend_activity"),
    [{ userId: "b" }, { userId: "c" }]
  );
});

test("notifications_push is NOT a row gate (push-only, handled by the helper)", () => {
  const prefs = [{ user_id: "a", notifications_push: false }];
  assert.deepEqual(
    categoryGatedRecipients(["a"], prefs, "notifications_friend_activity"),
    [{ userId: "a" }]
  );
});

test("null categoryKey skips gating entirely", () => {
  const prefs = [{ user_id: "a", notifications_friend_activity: false }];
  assert.deepEqual(categoryGatedRecipients(["a"], prefs, null), [{ userId: "a" }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/notifications-inbox.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `notify-recipients.mjs`**

```js
// supabase/functions/_shared/notify-recipients.mjs
//
// Pure recipient gating shared by the six send paths. Category preferences
// (notifications_happy_hours / _venue_updates / _friend_activity /
// _venue_scans) gate the notification row itself; notifications_push is a
// push-only gate applied later inside notify.ts. Missing pref row = opted in.
// Plain ESM so Deno and CI's Node 20 both import it directly.

export function categoryGatedRecipients(userIds, prefRows, categoryKey) {
  const disabled = new Set(
    categoryKey === null
      ? []
      : (prefRows ?? [])
          .filter((p) => p && p[categoryKey] === false)
          .map((p) => p.user_id)
  );
  return [...new Set(userIds ?? [])]
    .filter((id) => Boolean(id) && !disabled.has(id))
    .map((userId) => ({ userId }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/notifications-inbox.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `notify.ts`**

```ts
// supabase/functions/_shared/notify.ts
//
// The one write path for user notifications: insert inbox rows first (the
// inbox is the source of truth even when Expo is down), then push to
// recipients who have a token and haven't disabled push. Callers resolve the
// recipient set user-first (category gates via notify-recipients.mjs) so
// token-less users still get inbox rows. Never throws.

import { sendExpoPush, type ExpoPushMessage } from "./expo-push.ts";

const INSERT_BATCH = 500;

export type NotificationMessage = {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function sendUserNotifications(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  recipients: { userId: string }[],
  msg: NotificationMessage,
): Promise<{ inserted: number; pushed: number }> {
  const userIds = [...new Set(recipients.map((r) => r.userId).filter(Boolean))];
  if (userIds.length === 0 || !msg.title || !msg.body) return { inserted: 0, pushed: 0 };
  const data = msg.data ?? {};

  // 1) Inbox rows first.
  let inserted = 0;
  const rows = userIds.map((user_id) => ({
    user_id,
    type: msg.type,
    title: msg.title,
    body: msg.body,
    data,
  }));
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from("user_notifications").insert(batch);
    if (error) console.error("[notify] inbox insert failed:", error.message);
    else inserted += batch.length;
  }

  // 2) Push to recipients with a valid token and push enabled.
  const [{ data: tokenRows }, { data: prefRows }] = await Promise.all([
    supabase.from("user_push_tokens").select("user_id, expo_push_token").in("user_id", userIds),
    supabase.from("user_preferences").select("user_id, notifications_push").in("user_id", userIds),
  ]);
  const pushDisabled = new Set(
    // deno-lint-ignore no-explicit-any
    (prefRows ?? []).filter((p: any) => p.notifications_push === false).map((p: any) => p.user_id),
  );
  const seen = new Set<string>();
  const messages: ExpoPushMessage[] = [];
  // deno-lint-ignore no-explicit-any
  for (const row of (tokenRows ?? []) as any[]) {
    const token = row.expo_push_token;
    if (!token || !token.startsWith("ExponentPushToken")) continue;
    if (pushDisabled.has(row.user_id) || seen.has(token)) continue;
    seen.add(token);
    messages.push({ to: token, title: msg.title, body: msg.body, sound: "default", data });
  }
  const pushed = await sendExpoPush(messages);
  return { inserted, pushed };
}
```

- [ ] **Step 6: Typecheck**

Run: `deno check --no-config supabase/functions/_shared/notify.ts`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/notify-recipients.mjs supabase/functions/_shared/notify.ts test/notifications-inbox.test.mjs
git commit -m "feat(notifications): shared insert-then-push helper with user-first recipient gating"
```

---

### Task 4: Convert `notify-friend-activity`

**Files:**
- Modify: `supabase/functions/notify-friend-activity/index.ts`

**Interfaces:**
- Consumes: `sendUserNotifications` (Task 3), `categoryGatedRecipients` (Task 3), `followCopy` / `venueSaveCopy` / `itineraryShareCopy` (Task 2).
- Produces: rows/pushes with `data` payloads `{type:"friend", actorId}`, `{type:"venue", venueId}`, `{type:"itinerary", actorId, listId}` — identical to today.

- [ ] **Step 1: Rewrite the file's send half**

Keep lines 1–131 (webhook parsing, event/actor/target resolution, actor-name lookup, `targetUserIds` collection) except: delete the local `EXPO_PUSH_URL`, `BATCH_SIZE`, and `ExpoPushMessage` declarations (lines 14–23) and add imports:

```ts
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { followCopy, venueSaveCopy, itineraryShareCopy } from "../_shared/notification-copy.mjs";
```

Replace everything from the `── Fetch push tokens + preference check ──` block (line 133) to the end of the handler with:

```ts
  // ── Resolve recipients user-first ─────────────────────────────────
  // Category pref gates the row itself; push gating happens inside the
  // helper. Token-less users still get inbox rows.

  const targetIds = [...new Set(targetUserIds)].filter((id) => id && id !== actorId);
  if (targetIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no target users" }));
  }

  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_friend_activity")
    .in("user_id", targetIds);

  const recipients = categoryGatedRecipients(targetIds, prefRows ?? [], "notifications_friend_activity");
  if (recipients.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "all recipients opted out" }));
  }

  // ── Build message ─────────────────────────────────────────────────

  let copy: { title: string; body: string };
  let type = "";
  let navData: Record<string, unknown> = {};

  if (event === "follow") {
    copy = followCopy(actorName);
    type = "friend";
    navData = { type: "friend", actorId };
  } else if (event === "venue_save") {
    const venueId = meta.venueId as string | null;
    let venueName: string | null = null;
    if (venueId) {
      const { data: venue } = await supabase
        .from("venues")
        .select("name")
        .eq("id", venueId)
        .maybeSingle();
      venueName = venue?.name ?? null;
    }
    copy = venueSaveCopy(actorName, venueName);
    type = "venue";
    navData = { type: "venue", venueId: meta.venueId };
  } else {
    copy = itineraryShareCopy(actorName);
    type = "itinerary";
    navData = { type: "itinerary", actorId, listId: meta.listId };
  }

  const { inserted, pushed } = await sendUserNotifications(supabase, recipients, {
    type,
    title: copy.title,
    body: copy.body,
    data: navData,
  });

  return new Response(JSON.stringify({ inserted, sent: pushed }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Typecheck**

Run: `deno check --no-config supabase/functions/notify-friend-activity/index.ts`
Expected: clean.

- [ ] **Step 3: Run the full test suite (regression sweep)**

Run: `npm test`
Expected: PASS — no existing test greps this file's internals.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/notify-friend-activity/index.ts
git commit -m "feat(notifications): friend-activity notifications write the inbox, user-first recipients"
```

---

### Task 5: Convert `notify-venue-updates`

**Files:**
- Modify: `supabase/functions/notify-venue-updates/index.ts`

**Interfaces:**
- Consumes: `sendUserNotifications`, `categoryGatedRecipients`, `happyHourPublishedCopy`, `happyHourUpdatedCopy`.
- Produces: `data` payload `{type:"happy_hour", venueId, windowId}` — identical to today.

- [ ] **Step 1: Rewrite the send half**

Delete the local `EXPO_PUSH_URL`/`BATCH_SIZE`/`ExpoPushMessage` (lines 11–20); add:

```ts
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { happyHourPublishedCopy, happyHourUpdatedCopy } from "../_shared/notification-copy.mjs";
```

Replace everything from the `user_followed_venues` query with the `!inner` joins (line 81) through the end of the handler with:

```ts
  // Followers of this venue, user-first: no token join, so token-less
  // followers still get inbox rows. Category pref gates the row.
  const { data: followerRows, error: followerErr } = await supabase
    .from("user_followed_venues")
    .select("user_id")
    .eq("venue_id", venueId);

  if (followerErr) {
    console.error("[notify-venue] follower fetch failed:", followerErr.message);
    return new Response(JSON.stringify({ error: followerErr.message }), { status: 500 });
  }

  const followerIds = [...new Set((followerRows ?? []).map((r: { user_id: string }) => r.user_id))];
  if (followerIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no followers" }));
  }

  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_venue_updates")
    .in("user_id", followerIds);

  const recipients = categoryGatedRecipients(followerIds, prefRows ?? [], "notifications_venue_updates");
  if (recipients.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "all followers opted out" }));
  }

  const isNew = eventType === "INSERT";
  const { title, body } = isNew
    ? happyHourPublishedCopy(venueName)
    : happyHourUpdatedCopy(venueName);

  const { inserted, pushed } = await sendUserNotifications(supabase, recipients, {
    type: "happy_hour",
    title,
    body,
    data: { type: "happy_hour", venueId, windowId },
  });

  return new Response(JSON.stringify({ inserted, sent: pushed }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Typecheck + suite**

Run: `deno check --no-config supabase/functions/notify-venue-updates/index.ts && npm test`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/notify-venue-updates/index.ts
git commit -m "feat(notifications): venue-update notifications write the inbox, user-first recipients"
```

---

### Task 6: Convert `notify-upcoming-happy-hours`

**Files:**
- Modify: `supabase/functions/notify-upcoming-happy-hours/index.ts`
- Modify: `test/venue-scan-notify.test.mjs:50-54` (the "uses the shared sender" assertion)

**Interfaces:**
- Consumes: `sendUserNotifications`, `categoryGatedRecipients`, `happyHourStartingCopy`.
- Produces: `data` payload `{type:"happy_hour", venueId, windowId}` per window — identical to today.

**Constraint:** the literal string `America/Chicago` must remain in this file (`upcoming-push-schedule.test.mjs:18` asserts it) — it does, in the `Intl.DateTimeFormat` that computes the lookahead window. `user_followed_venues` must also remain (asserted for the events fn; keep the query on this table regardless).

- [ ] **Step 1: Rewrite the send half**

Replace the import of `sendExpoPush` (line 11) with:

```ts
import { sendUserNotifications } from "../_shared/notify.ts";
import { categoryGatedRecipients } from "../_shared/notify-recipients.mjs";
import { happyHourStartingCopy } from "../_shared/notification-copy.mjs";
```

Replace everything from the `user_followed_venues` `!inner` query (line 94) to the end of the handler with:

```ts
  // Followers of the eligible venues, user-first (no token join).
  const eligibleIds = [...new Set(eligibleWindows.map((w: any) => w.venue_id))];
  const { data: followerRows, error: followerErr } = await supabase
    .from("user_followed_venues")
    .select("user_id, venue_id")
    .in("venue_id", eligibleIds);

  if (followerErr) {
    console.error("[notify] follower fetch failed:", followerErr.message);
    return new Response(JSON.stringify({ error: followerErr.message }), { status: 500 });
  }

  if (!followerRows || followerRows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no followers for eligible venues" }));
  }

  const allFollowerIds = [...new Set((followerRows as any[]).map((r) => r.user_id))];
  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_happy_hours")
    .in("user_id", allFollowerIds);

  // Group followers per venue, then send one notification per eligible window.
  const followersByVenue = new Map<string, string[]>();
  for (const r of followerRows as any[]) {
    const list = followersByVenue.get(r.venue_id) ?? [];
    list.push(r.user_id);
    followersByVenue.set(r.venue_id, list);
  }

  let inserted = 0;
  let pushed = 0;
  for (const window of eligibleWindows as any[]) {
    const recipients = categoryGatedRecipients(
      followersByVenue.get(window.venue_id) ?? [],
      prefRows ?? [],
      "notifications_happy_hours",
    );
    if (recipients.length === 0) continue;

    const venueName = (window.venue as any)?.name ?? null;
    const { title, body } = happyHourStartingCopy(
      venueName,
      window.start_time.slice(0, 5),
      window.label ?? null,
    );

    const result = await sendUserNotifications(supabase, recipients, {
      type: "happy_hour",
      title,
      body,
      data: { type: "happy_hour", venueId: window.venue_id, windowId: window.id },
    });
    inserted += result.inserted;
    pushed += result.pushed;
  }

  return new Response(JSON.stringify({ inserted, sent: pushed }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Update the stale shared-sender assertion**

In `test/venue-scan-notify.test.mjs`, replace the test at lines 50–54 with:

```js
test("notify-upcoming-happy-hours routes through the shared inbox helper (one sender, not two)", () => {
  const src = read("supabase/functions/notify-upcoming-happy-hours/index.ts");
  assert.match(src, /from "\.\.\/_shared\/notify\.ts"/);
  assert.match(src, /sendUserNotifications\(/);
  assert.doesNotMatch(src, /exp\.host/);
});
```

- [ ] **Step 3: Typecheck + suite**

Run: `deno check --no-config supabase/functions/notify-upcoming-happy-hours/index.ts && npm test`
Expected: both clean — including `upcoming-push-schedule.test.mjs` (America/Chicago still present) and the updated `venue-scan-notify.test.mjs`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/notify-upcoming-happy-hours/index.ts test/venue-scan-notify.test.mjs
git commit -m "feat(notifications): upcoming-happy-hour pushes write the inbox; 12-hour Central copy"
```

---

### Task 7: Convert `notify-upcoming-events`

**Files:**
- Modify: `supabase/functions/notify-upcoming-events/index.ts`

**Interfaces:**
- Consumes: `sendUserNotifications`, `categoryGatedRecipients`, `eventStartingCopy`.
- Produces: `data` payload `{type:"event", venueId, eventId}` per event — identical to today.

**Constraint:** `upcoming-push-schedule.test.mjs:22-23` asserts this file contains `venue_events`, `starts_at`, `user_followed_venues`, `notifications_venue_updates`, `x-notify-token` — all survive this rewrite (the category gate for events remains `notifications_venue_updates`, matching current behavior).

- [ ] **Step 1: Rewrite the send half**

Replace the `sendExpoPush` import (line 11) with the same three imports as Task 6 (swapping `happyHourStartingCopy` for `eventStartingCopy`). Replace everything from the `user_followed_venues` `!inner` query (line 84) to the end of the handler with:

```ts
  // Followers of the eligible venues, user-first (no token join).
  const { data: followerRows, error: followerErr } = await supabase
    .from("user_followed_venues")
    .select("user_id, venue_id")
    .in("venue_id", eligibleIds);

  if (followerErr) {
    console.error("[notify-events] follower fetch failed:", followerErr.message);
    return new Response(JSON.stringify({ error: followerErr.message }), { status: 500 });
  }

  if (!followerRows || followerRows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no followers for eligible venues" }));
  }

  const allFollowerIds = [...new Set((followerRows as any[]).map((r) => r.user_id))];
  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("user_id, notifications_venue_updates")
    .in("user_id", allFollowerIds);

  const followersByVenue = new Map<string, string[]>();
  for (const r of followerRows as any[]) {
    const list = followersByVenue.get(r.venue_id) ?? [];
    list.push(r.user_id);
    followersByVenue.set(r.venue_id, list);
  }

  let inserted = 0;
  let pushed = 0;
  for (const ev of eligibleEvents as any[]) {
    const recipients = categoryGatedRecipients(
      followersByVenue.get(ev.venue_id) ?? [],
      prefRows ?? [],
      "notifications_venue_updates",
    );
    if (recipients.length === 0) continue;

    const venueName = (ev.venue as any)?.name ?? null;
    const { title, body } = eventStartingCopy(ev.title, venueName, ev.starts_at);

    const result = await sendUserNotifications(supabase, recipients, {
      type: "event",
      title,
      body,
      data: { type: "event", venueId: ev.venue_id, eventId: ev.id },
    });
    inserted += result.inserted;
    pushed += result.pushed;
  }

  return new Response(JSON.stringify({ inserted, sent: pushed }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

(The now-unused `venueEventsMap` block from lines 103–109 is deleted with the rest of the replaced region.)

- [ ] **Step 2: Typecheck + suite**

Run: `deno check --no-config supabase/functions/notify-upcoming-events/index.ts && npm test`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/notify-upcoming-events/index.ts
git commit -m "feat(notifications): upcoming-event pushes write the inbox with absolute-time copy"
```

---

### Task 8: Convert `evaluate-visit-ratings` + `track-visit`; add cross-sender static guards

**Files:**
- Modify: `supabase/functions/evaluate-visit-ratings/index.ts`
- Modify: `supabase/functions/track-visit/index.ts:98-158` (`notifyVenueTeam`)
- Modify: `test/venue-scan-notify.test.mjs:65-72` (the prefs assertion)
- Modify: `test/notifications-inbox.test.mjs` (append the sender guards)

**Interfaces:**
- Consumes: `sendUserNotifications`, `categoryGatedRecipients`, `visitRatingCopy`; `buildVenueScanMessage` (existing, unchanged).
- Produces: `visit_rating` rows carry `data: { type, visitId, venueId, venueName, aspects, source: "server" }` — identical to today (the inbox tap bridge in Task 10 depends on these fields). `track-visit` rows carry `data: { type: "venue", venueId }`.

- [ ] **Step 1: Rewrite `evaluate-visit-ratings`' per-visit send**

Delete `EXPO_PUSH_URL` (line 3); add the Task-3/2 imports (`sendUserNotifications`, `visitRatingCopy`). Replace the body of the per-visit loop from the token fetch (line 35) to the end of the loop (line 67) with:

```ts
    const { title, body } = visitRatingCopy(venue?.name);
    const aspects = Array.isArray(venue?.post_visit_rating_aspects) ? venue.post_visit_rating_aspects : [];

    const { inserted, pushed } = await sendUserNotifications(
      supabase,
      [{ userId: (visit as any).user_id }],
      {
        type: "visit_rating",
        title,
        body,
        data: {
          type: "visit_rating",
          visitId: (visit as any).id,
          venueId: (visit as any).venue_id,
          venueName: venue?.name,
          aspects,
          source: "server",
        },
      },
    );

    // The prompt now exists in the inbox even when no push token exists, so
    // an insert alone counts as prompted (previously only a push did).
    if (inserted > 0 || pushed > 0) {
      sent += pushed;
      await supabase
        .from("venue_visits")
        .update({ rating_prompted_at: new Date().toISOString(), rating_prompt_source: "server_push" })
        .eq("id", (visit as any).id);
    }
```

(There is no per-category preference for rating prompts today; the venue-level `post_visit_rating_enabled` gate above the loop stays as-is.)

- [ ] **Step 2: Rewrite `track-visit`'s `notifyVenueTeam`**

Add imports `sendUserNotifications` (from `../_shared/notify.ts`) and `categoryGatedRecipients` (from `../_shared/notify-recipients.mjs`). Replace the function body from the prefs fetch (line 114) through the `sendExpoPush` call (line 151) with:

```ts
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("user_id, notifications_venue_scans")
      .in("user_id", memberIds);

    // notifications_venue_scans gates the row; notifications_push is applied
    // push-only inside sendUserNotifications.
    const recipients = categoryGatedRecipients(memberIds, prefs ?? [], "notifications_venue_scans");
    if (recipients.length === 0) return;

    const { title, body } = buildVenueScanMessage(source, venueName);
    await sendUserNotifications(supabase, recipients, {
      type: "venue",
      title,
      body,
      data: { type: "venue", venueId },
    });
```

Remove the now-unused `sendExpoPush` import from `track-visit/index.ts` (line 22) — the helper owns it.

- [ ] **Step 3: Update the stale `track-visit` prefs assertion**

In `test/venue-scan-notify.test.mjs`, replace the test at lines 65–72 with:

```js
test("track-visit targets owners/managers, respects the scan pref, and opens the venue", () => {
  const src = read("supabase/functions/track-visit/index.ts");
  assert.match(src, /\.in\("role", \["owner", "manager"\]\)/);
  assert.match(src, /notifications_venue_scans/);
  assert.match(src, /sendUserNotifications\(/);
  assert.match(src, /type: "venue"/);
});
```

(`notifications_push` and `ExponentPushToken` moved into `_shared/notify.ts` — the push gate is asserted there by the guards below.)

- [ ] **Step 4: Append the cross-sender static guards to `test/notifications-inbox.test.mjs`**

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const readFn = (name) =>
  readFileSync(join(__dirname2, "..", "supabase/functions", name, "index.ts"), "utf8");

const SENDERS = [
  "notify-friend-activity",
  "notify-venue-updates",
  "notify-upcoming-happy-hours",
  "notify-upcoming-events",
  "evaluate-visit-ratings",
  "track-visit",
];

test("all six send paths route through the shared inbox helper", () => {
  for (const name of SENDERS) {
    const src = readFn(name);
    assert.match(src, /from "\.\.\/_shared\/notify\.ts"/, `${name} must import notify.ts`);
    assert.match(src, /sendUserNotifications\(/, `${name} must call sendUserNotifications`);
  }
});

test("no sender talks to Expo directly (exp.host lives only in expo-push.ts)", () => {
  for (const name of SENDERS) {
    assert.doesNotMatch(readFn(name), /exp\.host/, `${name} must not hand-roll Expo pushes`);
  }
});

test("the helper inserts before pushing and applies the push-only gate", () => {
  const src = readFileSync(
    join(__dirname2, "..", "supabase/functions/_shared/notify.ts"),
    "utf8"
  );
  const insertIdx = src.indexOf('from("user_notifications").insert');
  const pushIdx = src.indexOf("sendExpoPush(");
  assert.ok(insertIdx > 0 && pushIdx > insertIdx, "inbox insert must precede the push");
  assert.match(src, /notifications_push/);
  assert.match(src, /ExponentPushToken/);
});
```

- [ ] **Step 5: Typecheck + full suite**

Run: `deno check --no-config supabase/functions/evaluate-visit-ratings/index.ts supabase/functions/track-visit/index.ts && npm test`
Expected: clean. `venue-scan-notify.test.mjs`'s `EdgeRuntime.waitUntil` ordering assertion still passes (`notifyVenueTeam`'s call site is untouched).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/evaluate-visit-ratings/index.ts supabase/functions/track-visit/index.ts test/venue-scan-notify.test.mjs test/notifications-inbox.test.mjs
git commit -m "feat(notifications): visit-rating + venue-team sends write the inbox; static guards lock all six senders to the helper"
```

---

### Task 9: Mobile data layer — event bus, rating bridge, hooks

**Files:**
- Create: `apps/mobile/src/lib/notificationsEvents.ts`
- Create: `apps/mobile/src/lib/ratingRequest.ts`
- Create: `apps/mobile/src/hooks/useUserNotifications.ts`
- Create: `apps/mobile/src/hooks/useUnreadNotificationsBadge.ts`
- Modify: `apps/mobile/App.tsx` (register the bridge)

**Interfaces:**
- Consumes: `supabase` from `../api/supabaseClient`, `useCurrentUser` (existing), `triggerRating(venueId, venueName, visitId?, aspects?, source?)` from `useVisitRating` (existing, `apps/mobile/src/hooks/useVisitRating.ts:74`).
- Produces:
  - `onUnreadChanged(fn) / emitUnreadChanged()`
  - `registerVisitRatingHandler(fn) / requestVisitRating({venueId, venueName, visitId?, aspects?})`
  - `useUserNotifications()` → `{ notifications: UserNotification[], unreadCount, loading, refresh, markRead(id), markAllRead() }` where `UserNotification = { id, type, title, body, data, createdAt, readAt }`
  - `useUnreadNotificationsBadge()` → `number`

- [ ] **Step 1: Write the event bus**

```ts
// src/lib/notificationsEvents.ts
//
// Module-singleton signal connecting the inbox (which marks rows read) to the
// tab badge in AppNavigator, which lives outside the screen tree.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onUnreadChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitUnreadChanged(): void {
  listeners.forEach((fn) => fn());
}
```

- [ ] **Step 2: Write the rating bridge**

```ts
// src/lib/ratingRequest.ts
//
// Bridges inbox taps on visit_rating rows to the VisitRatingModal mounted at
// App.tsx root (same handoff idea as pendingCheckinPrime). App.tsx registers
// a handler wrapping useVisitRating's triggerRating.
export type VisitRatingRequest = {
  venueId: string;
  venueName: string;
  visitId?: string;
  aspects?: string[];
};

type Handler = (req: VisitRatingRequest) => void;
let handler: Handler | null = null;

export function registerVisitRatingHandler(fn: Handler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function requestVisitRating(req: VisitRatingRequest): void {
  handler?.(req);
}
```

- [ ] **Step 3: Register the bridge in `App.tsx`**

Below the existing `useVisitRating()` destructure (`App.tsx:40-41`), add:

```tsx
  useEffect(() => {
    return registerVisitRatingHandler((req) =>
      triggerRating(req.venueId, req.venueName, req.visitId, req.aspects ?? [], "server")
    );
  }, [triggerRating]);
```

with `import { registerVisitRatingHandler } from "./src/lib/ratingRequest";` (and `useEffect` in the React import if not already there).

- [ ] **Step 4: Write `useUserNotifications`**

```ts
// src/hooks/useUserNotifications.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { emitUnreadChanged } from "../lib/notificationsEvents";

export type UserNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

const PAGE_SIZE = 100;

// deno/eslint-friendly row mapper kept module-level for reuse in tests later
const rowToNotification = (r: any): UserNotification => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  data: (r.data ?? {}) as Record<string, unknown>,
  createdAt: r.created_at,
  readAt: r.read_at ?? null,
});

/**
 * Inbox list + read state for the Notifications segment. RLS scopes reads to
 * the owner; the explicit user_id filter is defense-in-depth. Updates are
 * column-limited to read_at by the DB grant.
 */
export function useUserNotifications() {
  const { user } = useCurrentUser();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("user_notifications")
      .select("id, type, title, body, data, created_at, read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (!error) setNotifications((data ?? []).map(rowToNotification));
    setLoading(false);
    emitUnreadChanged();
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n))
    );
    await supabase
      .from("user_notifications")
      .update({ read_at: now })
      .eq("id", id)
      .is("read_at", null);
    emitUnreadChanged();
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    await supabase
      .from("user_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    emitUnreadChanged();
  }, [user?.id]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}
```

- [ ] **Step 5: Write `useUnreadNotificationsBadge`**

```ts
// src/hooks/useUnreadNotificationsBadge.ts
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { onUnreadChanged } from "../lib/notificationsEvents";

/**
 * Unread count for the Activity tab badge. Head-only count query (cheap under
 * the partial unread index). Refreshes on mount, app foreground, and any
 * mark-read via the notifications event bus.
 */
export function useUnreadNotificationsBadge(): number {
  const { user } = useCurrentUser();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    const { count: unread } = await supabase
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    setCount(unread ?? 0);
  }, [user?.id]);

  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    const off = onUnreadChanged(() => void load());
    return () => {
      sub.remove();
      off();
    };
  }, [load]);

  return count;
}
```

- [ ] **Step 6: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/notificationsEvents.ts apps/mobile/src/lib/ratingRequest.ts apps/mobile/src/hooks/useUserNotifications.ts apps/mobile/src/hooks/useUnreadNotificationsBadge.ts apps/mobile/App.tsx
git commit -m "feat(mobile): notifications inbox data layer — hooks, badge count, rating-modal bridge"
```

---

### Task 10: ActivityScreen — Notifications segment

**Files:**
- Modify: `apps/mobile/src/screens/ActivityScreen.tsx`

**Interfaces:**
- Consumes: `useUserNotifications` (Task 9), `requestVisitRating` (Task 9), `resolveNotificationTarget` from `../lib/notificationTarget` (existing).

- [ ] **Step 1: Extend the tab type and default** (`ActivityScreen.tsx:361,370`)

```ts
type Tab = "notifications" | "friends" | "discover" | "checkins" | "people";
```
```ts
const [tab, setTab] = useState<Tab>("notifications");
```

- [ ] **Step 2: Wire the hook and the tap handler**

Add imports:

```ts
import { useUserNotifications, type UserNotification } from "../hooks/useUserNotifications";
import { requestVisitRating } from "../lib/ratingRequest";
import { resolveNotificationTarget } from "../lib/notificationTarget";
```

Inside the component, next to the other hooks:

```ts
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    refresh: refreshNotifications,
    markRead,
    markAllRead,
  } = useUserNotifications();

  const handleNotificationPress = (n: UserNotification) => {
    void markRead(n.id);
    const data = n.data ?? {};
    if (data.type === "visit_rating") {
      requestVisitRating({
        venueId: String(data.venueId ?? ""),
        venueName: String(data.venueName ?? ""),
        visitId: typeof data.visitId === "string" ? data.visitId : undefined,
        aspects: Array.isArray(data.aspects) ? (data.aspects as string[]) : [],
      });
      return;
    }
    const target = resolveNotificationTarget(data);
    if (target) navigation.navigate(target.screen as any, target.params as any);
  };
```

Add `"notifications"` to the `isLoading` chain (`ActivityScreen.tsx:447-451`):

```ts
  const isLoading =
    tab === "notifications" ? notificationsLoading
    : tab === "friends" ? followersLoading || activityLoading
    : tab === "discover" ? (useDiscoverFeedSource ? discoverLoading : suggestionsLoading)
    : tab === "people" ? false
    : checkinsLoading;
```

Refresh on focus: ActivityScreen already imports `useFocusEffect`; add alongside existing focus logic (or as a new effect if none exists for data):

```ts
  useFocusEffect(
    useCallback(() => {
      void refreshNotifications();
    }, [refreshNotifications])
  );
```

- [ ] **Step 3: Add the segment and the list**

Add the segment first in the `SegmentedTabs` array (`ActivityScreen.tsx:492`):

```tsx
          { key: "notifications", label: "Notifications" },
```

Add the `NotificationCard` component near the other card components (after `ActivityCard`):

```tsx
/* ── Notification Card ── */

const NotificationCard: React.FC<{
  item: UserNotification;
  onPress: (n: UserNotification) => void;
}> = ({ item, onPress }) => (
  <Pressable
    onPress={() => onPress(item)}
    style={({ pressed }) => [styles.notifRow, pressed && styles.buttonPressed]}
  >
    <View style={styles.notifDotWrap}>
      {!item.readAt ? <View style={styles.notifDot} /> : null}
    </View>
    <View style={styles.notifTextWrap}>
      <View style={styles.notifTitleRow}>
        <Text
          style={[styles.notifTitle, !item.readAt && styles.notifTitleUnread]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
      </View>
      <Text style={styles.notifBody} numberOfLines={2}>
        {item.body}
      </Text>
    </View>
  </Pressable>
);
```

Add the branch to the tab render chain (before the `tab === "friends"` branch at `ActivityScreen.tsx:506`):

```tsx
      ) : tab === "notifications" ? (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={() => void refreshNotifications()}
          refreshing={notificationsLoading}
          ListHeaderComponent={
            unreadCount > 0 ? (
              <View style={styles.notifHeaderRow}>
                <Pressable
                  onPress={() => void markAllRead()}
                  style={({ pressed }) => [pressed && styles.buttonPressed]}
                >
                  <Text style={styles.notifMarkAll}>Mark all read</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptyText}>
                New followers, happy hours, and shared lists land here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <NotificationCard item={item} onPress={handleNotificationPress} />
          )}
        />
```

- [ ] **Step 4: Add the styles** (in the `StyleSheet.create` block, matching neighbors' idiom)

```ts
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.md,
  },
  notifDotWrap: {
    width: 16,
    paddingTop: 6,
    alignItems: "flex-start",
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  notifTextWrap: {
    flex: 1,
  },
  notifTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  notifTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  notifTitleUnread: {
    fontWeight: "700",
  },
  notifTime: {
    fontSize: 12,
    color: colors.textMutedLight,
  },
  notifBody: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  notifHeaderRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingBottom: spacing.sm,
  },
  notifMarkAll: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
```

(`colors.textMuted` exists — `apps/mobile/src/theme/colors.ts:19`.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/ActivityScreen.tsx
git commit -m "feat(mobile): Notifications segment on the Activity tab — inbox list, mark-read, tap routing"
```

---

### Task 11: Activity tab badge in `AppNavigator`

**Files:**
- Modify: `apps/mobile/src/navigation/AppNavigator.tsx`

**Interfaces:**
- Consumes: `useUnreadNotificationsBadge` (Task 9). Badge styling copied from the dead navigator (`apps/mobile/src/navigation/index.tsx:163`) — copy, don't import; `navigation/index.tsx` stays untouched dead code.

- [ ] **Step 1: Wire the badge**

In the `AppTabs` component (where `isGuest` is already in scope), add:

```ts
  const unread = useUnreadNotificationsBadge();
```

with `import { useUnreadNotificationsBadge } from "../hooks/useUnreadNotificationsBadge";`.

Change the Activity `Tab.Screen` (`AppNavigator.tsx:107-110`) to:

```tsx
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: styles.tabBarBadge,
        }}
      />
```

Add a `StyleSheet.create` block at the bottom of the file (AppNavigator currently has none; it already imports `StyleSheet`):

```ts
const styles = StyleSheet.create({
  // Copied from the dead navigation/index.tsx badge so the look is identical
  // if that file is ever revived.
  tabBarBadge: {
    backgroundColor: colors.error,
    color: colors.surface,
    fontSize: 11,
    fontWeight: "600",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    lineHeight: 16,
  },
});
```

(Verify the exact property list against `navigation/index.tsx:163-170` when editing — copy all of its properties verbatim.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/navigation/AppNavigator.tsx
git commit -m "feat(mobile): unread notifications badge on the Activity tab"
```

---

### Task 12: Mobile static guards + full verification

**Files:**
- Test: `test/mobile-notifications-inbox.test.mjs`

- [ ] **Step 1: Write the static guards**

```js
// test/mobile-notifications-inbox.test.mjs
//
// Static wiring guards for the mobile notifications inbox (CI can't run RN
// code — repo pattern is greps over the source, cf. mobile-onboarding.test.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, "..", rel), "utf8");

test("ActivityScreen has the Notifications segment wired to the inbox hook", () => {
  const src = read("apps/mobile/src/screens/ActivityScreen.tsx");
  assert.match(src, /\{ key: "notifications", label: "Notifications" \}/);
  assert.match(src, /useUserNotifications/);
  assert.match(src, /resolveNotificationTarget/);
  assert.match(src, /requestVisitRating/);
  assert.match(src, /markAllRead/);
});

test("inbox taps route via the existing routing table; visit_rating bypasses it", () => {
  const src = read("apps/mobile/src/screens/ActivityScreen.tsx");
  const visitIdx = src.indexOf('data.type === "visit_rating"');
  const routeIdx = src.indexOf("resolveNotificationTarget(data)");
  assert.ok(visitIdx > 0 && routeIdx > visitIdx, "visit_rating must be handled before generic routing");
});

test("notificationTarget stays the single routing table (no inbox-specific routes added)", () => {
  const src = read("apps/mobile/src/lib/notificationTarget.mjs");
  assert.doesNotMatch(src, /user_notifications/);
});

test("AppNavigator badges the Activity tab from the unread hook", () => {
  const src = read("apps/mobile/src/navigation/AppNavigator.tsx");
  assert.match(src, /useUnreadNotificationsBadge/);
  assert.match(src, /tabBarBadge/);
  assert.match(src, /"99\+"/);
});

test("App.tsx registers the visit-rating bridge", () => {
  const src = read("apps/mobile/App.tsx");
  assert.match(src, /registerVisitRatingHandler/);
});

test("markRead is guarded against clobbering an existing read_at", () => {
  const src = read("apps/mobile/src/hooks/useUserNotifications.ts");
  assert.match(src, /\.is\("read_at", null\)/);
  assert.match(src, /order\("created_at", \{ ascending: false \}\)/);
});

test("badge hook refreshes on foreground and on the unread bus", () => {
  const src = read("apps/mobile/src/hooks/useUnreadNotificationsBadge.ts");
  assert.match(src, /AppState\.addEventListener/);
  assert.match(src, /onUnreadChanged/);
  assert.match(src, /head: true/);
});
```

- [ ] **Step 2: Run it, then the whole suite and all typechecks**

Run:
```bash
node --test test/mobile-notifications-inbox.test.mjs
npm test
deno check --no-config supabase/functions/_shared/notify.ts supabase/functions/notify-friend-activity/index.ts supabase/functions/notify-venue-updates/index.ts supabase/functions/notify-upcoming-happy-hours/index.ts supabase/functions/notify-upcoming-events/index.ts supabase/functions/evaluate-visit-ratings/index.ts supabase/functions/track-visit/index.ts
cd apps/mobile && npx tsc --noEmit
```
Expected: everything green.

- [ ] **Step 3: Commit**

```bash
git add test/mobile-notifications-inbox.test.mjs
git commit -m "test(mobile): static wiring guards for the notifications inbox"
```

---

### Task 13: PR, deploy, prod verify

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/notifications-inbox
gh pr create --title "feat: notifications inbox — user_notifications spine, single-voice copy, Activity-tab segment + badge" --body "..."
```

PR body summarizes: table + RLS, six senders converged on `_shared/notify.ts`, copy redesign table, mobile UI (ships with next store build — OTA off), test coverage. End with the standard generated-with footer.

- [ ] **Step 2: Wait for CI green** (required checks `node` + `supabase-migrations`). A change isn't done until CI is green — local pass ≠ CI pass.

- [ ] **Step 3: Squash-merge.** The migration auto-applies to prod via Supabase DB Deploy on the master merge — verify in the Actions run.

- [ ] **Step 4: Deploy the six functions** (after the migration is live; ordering matters only for row completeness — the helper tolerates a missing table by logging):

```bash
supabase functions deploy notify-friend-activity notify-venue-updates notify-upcoming-happy-hours notify-upcoming-events evaluate-visit-ratings track-visit
```

- [ ] **Step 5: Prod verify**

- Supabase advisors: no new warnings on `user_notifications`.
- After the next organic send (or a manual `x-notify-token` POST to `notify-upcoming-happy-hours`), confirm rows: `select type, title, body, created_at from user_notifications order by created_at desc limit 10;` — titles must match the locked copy table (12-hour times).
- Confirm a token-less test user receives rows (the user-first flip working).

- [ ] **Step 6: Mobile rollout note** — the UI rides the next store build (OTA re-enabled for that build per PR #135; follow `docs/ota-runbook.md` for any subsequent OTA). Rows accumulate meanwhile — by design.

---

## Self-review notes (already applied)

- **Spec coverage:** table+indexes+RLS (T1), copy (T2 — an addition the spec implies via "well-designed messages"), helper + user-first flip (T3), all six senders (T4–T8), hook/segment/badge/mark-read (T9–T11), all four test categories from the spec's Testing section (T1 RLS static, T2 pure `.mjs`, T8 static guards, T6/T7 keep the edge-fn precedent tests green), rollout constraints (T13, global constraints).
- **Deliberate deviations from current behavior, all spec-sanctioned:** token-less users now receive rows; `notifications_push=false` users still get rows (push-only gate); `evaluate-visit-ratings` marks `rating_prompted_at` on insert (not only on push); `track-visit` no longer treats `notifications_push=false` as a full opt-out (venue-scans pref gates the row).
- **Type consistency check:** `sendUserNotifications(supabase, recipients, msg)` and `categoryGatedRecipients(ids, prefs, key)` used identically across T4–T8; `UserNotification.createdAt/readAt` camelCase in mobile, snake_case only at the query boundary.
