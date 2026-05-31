# Venue-team Scan Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `track-visit` records an attribution event, push a real-time notification to the venue's owners/managers ("New visit at {venue}"); tapping opens the venue.

**Architecture:** Inline in `track-visit` via `EdgeRuntime.waitUntil` after the successful (non-deduped) insert — no separate edge function. Recipients = `org_members(owner|manager)` for the venue's org, minus anyone who turned off push or venue-scan notifications. A shared `_shared/expo-push.ts` sender (extracted from `notify-upcoming-happy-hours`) does the batched send; a pure `_shared/scan-message.mjs` builds source-aware copy. Mobile tap is already wired (`useNotificationNavigation` handles `data.type === "venue"`).

**Tech Stack:** Supabase Edge Functions (Deno), Postgres migration, Expo push (`exp.host`), `node:test` (CI Node 20).

**Spec:** `docs/superpowers/specs/2026-05-31-venue-team-scan-push-design.md`

---

## File Structure

- **Create** `supabase/migrations/20260531230000_add_venue_scan_notification_pref.sql` — adds the `notifications_venue_scans` column.
- **Create** `supabase/functions/_shared/scan-message.mjs` — pure source-aware message builder.
- **Create** `supabase/functions/_shared/expo-push.ts` — one batched Expo sender.
- **Modify** `supabase/functions/notify-upcoming-happy-hours/index.ts` — use the shared sender.
- **Modify** `supabase/functions/track-visit/index.ts` — resolve org/name + fire the venue-team push.
- **Create** `test/venue-scan-notify.test.mjs` — unit test (message builder) + `readFileSync` structure assertions (repo convention for edge fns / migrations).

---

## Task 1: Migration — `notifications_venue_scans` column

**Files:**
- Create: `supabase/migrations/20260531230000_add_venue_scan_notification_pref.sql`
- Test: `test/venue-scan-notify.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/venue-scan-notify.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("migration adds notifications_venue_scans default true", () => {
  const sql = read("supabase/migrations/20260531230000_add_venue_scan_notification_pref.sql");
  assert.match(
    sql,
    /add column if not exists notifications_venue_scans boolean not null default true/i,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/venue-scan-notify.test.mjs`
Expected: FAIL — `ENOENT` (migration file does not exist yet).

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260531230000_add_venue_scan_notification_pref.sql`:

```sql
-- Per-user opt-out for venue-team scan notifications: a venue's owners/managers get
-- a push when their venue records an attribution event (track-visit). Default on;
-- a missing user_preferences row is treated as on by the sender.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS notifications_venue_scans boolean NOT NULL DEFAULT true;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/venue-scan-notify.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260531230000_add_venue_scan_notification_pref.sql test/venue-scan-notify.test.mjs
git commit -m "feat(venue-scan-notify): add notifications_venue_scans preference column"
```

---

## Task 2: Pure source-aware message builder

**Files:**
- Create: `supabase/functions/_shared/scan-message.mjs`
- Test: `test/venue-scan-notify.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add to `test/venue-scan-notify.test.mjs` — first add this import at the top (below the existing imports):

```js
import { buildVenueScanMessage } from "../supabase/functions/_shared/scan-message.mjs";
```

Then append these tests:

```js
test("buildVenueScanMessage: qr scan", () => {
  const m = buildVenueScanMessage("qr", "Sea Capitán");
  assert.match(m.title, /QR scan/i);
  assert.match(m.body, /scanned your QR code at Sea Capitán/);
});

test("buildVenueScanMessage: app_checkin", () => {
  const m = buildVenueScanMessage("app_checkin", "Sea Capitán");
  assert.match(m.title, /check-in/i);
  assert.match(m.body, /checked in at Sea Capitán/);
});

test("buildVenueScanMessage: push_click/organic/unknown fall back to a generic visit", () => {
  for (const s of ["push_click", "organic", "whatever"]) {
    const m = buildVenueScanMessage(s, "Sea Capitán");
    assert.match(m.title, /visit/i);
    assert.match(m.body, /Sea Capitán/);
  }
});

test("buildVenueScanMessage: blank venue name has a safe fallback", () => {
  const m = buildVenueScanMessage("qr", "");
  assert.match(m.body, /your venue/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/venue-scan-notify.test.mjs`
Expected: FAIL — cannot resolve `../supabase/functions/_shared/scan-message.mjs`.

- [ ] **Step 3: Create the message builder**

Create `supabase/functions/_shared/scan-message.mjs`:

```js
// supabase/functions/_shared/scan-message.mjs
//
// Pure, source-aware push copy for venue-team scan notifications. Plain ESM (.mjs)
// so both the Deno edge function and CI's Node 20 test import it directly — no type
// stripping (cf. the parseVenueLink.mjs lesson). No Deno/Node-specific APIs.

export function buildVenueScanMessage(source, venueName) {
  const name = venueName && venueName.trim().length > 0 ? venueName : "your venue";
  switch (source) {
    case "qr":
      return { title: "New QR scan", body: `Someone just scanned your QR code at ${name}.` };
    case "app_checkin":
      return { title: "New check-in", body: `Someone just checked in at ${name}.` };
    default:
      return { title: "New visit", body: `Someone just visited ${name} on HappiTime.` };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/venue-scan-notify.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/scan-message.mjs test/venue-scan-notify.test.mjs
git commit -m "feat(venue-scan-notify): source-aware push message builder"
```

---

## Task 3: Shared Expo sender + refactor notify-upcoming

**Files:**
- Create: `supabase/functions/_shared/expo-push.ts`
- Modify: `supabase/functions/notify-upcoming-happy-hours/index.ts`
- Test: `test/venue-scan-notify.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `test/venue-scan-notify.test.mjs`:

```js
test("shared expo-push exports sendExpoPush and batches at 100", () => {
  const src = read("supabase/functions/_shared/expo-push.ts");
  assert.match(src, /export async function sendExpoPush/);
  assert.match(src, /BATCH_SIZE = 100/);
});

test("notify-upcoming-happy-hours uses the shared sender (one sender, not two)", () => {
  const src = read("supabase/functions/notify-upcoming-happy-hours/index.ts");
  assert.match(src, /from "\.\.\/_shared\/expo-push\.ts"/);
  assert.match(src, /sendExpoPush\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/venue-scan-notify.test.mjs`
Expected: FAIL — `expo-push.ts` does not exist; `notify-upcoming` does not import it.

- [ ] **Step 3: Create the shared sender**

Create `supabase/functions/_shared/expo-push.ts`:

```ts
// supabase/functions/_shared/expo-push.ts
//
// One Expo push sender, shared across the edge functions. Batches at Expo's
// 100-messages-per-request limit, POSTs to exp.host, logs failures, and never
// throws to the caller. Returns the count accepted by Expo.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
};

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<number> {
  if (messages.length === 0) return 0;
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
      else console.error("[expo-push] send failed:", await res.text());
    } catch (err) {
      console.error("[expo-push] send error:", err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
```

- [ ] **Step 4: Refactor `notify-upcoming-happy-hours` to use it**

In `supabase/functions/notify-upcoming-happy-hours/index.ts`:

(a) Add the import directly below the existing `import { createClient } …` line:

```ts
import { sendExpoPush, type ExpoPushMessage } from "../_shared/expo-push.ts";
```

(b) Delete these now-shared declarations near the top (keep `LOOKAHEAD_MINUTES`):

```ts
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
};
```

(c) Replace the inline batch-send block:

```ts
  // Send in batches of BATCH_SIZE (Expo limit is 100/request)
  let totalSent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch)
    });
    if (res.ok) totalSent += batch.length;
    else console.error("[notify] expo push failed:", await res.text());
  }
```

with:

```ts
  const totalSent = await sendExpoPush(messages);
```

(Leave the rest — the `if (messages.length === 0)` guard and the final `return new Response(... { sent: totalSent } ...)` — unchanged.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/venue-scan-notify.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/expo-push.ts supabase/functions/notify-upcoming-happy-hours/index.ts test/venue-scan-notify.test.mjs
git commit -m "refactor(push): extract shared sendExpoPush; notify-upcoming consumes it"
```

---

## Task 4: Hook the venue-team push into track-visit

**Files:**
- Modify: `supabase/functions/track-visit/index.ts`
- Test: `test/venue-scan-notify.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `test/venue-scan-notify.test.mjs`:

```js
test("track-visit selects org_id + name and notifies the team AFTER a recorded insert", () => {
  const src = read("supabase/functions/track-visit/index.ts");
  assert.match(src, /select\("id, org_id, name"\)/);
  assert.match(src, /EdgeRuntime\.waitUntil\(\s*\n?\s*notifyVenueTeam/);
  // The hook must be after the insert, not on the deduped early-return path.
  const insertIdx = src.indexOf('from("venue_attribution_events")');
  const waitIdx = src.indexOf("EdgeRuntime.waitUntil");
  assert.ok(insertIdx > 0 && waitIdx > insertIdx, "push hook must come after the insert");
});

test("track-visit targets owners/managers, respects prefs, and opens the venue", () => {
  const src = read("supabase/functions/track-visit/index.ts");
  assert.match(src, /\.in\("role", \["owner", "manager"\]\)/);
  assert.match(src, /notifications_venue_scans/);
  assert.match(src, /notifications_push/);
  assert.match(src, /type: "venue"/);
  assert.match(src, /ExponentPushToken/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/venue-scan-notify.test.mjs`
Expected: FAIL — track-visit does not yet select `org_id`/`name` or call `notifyVenueTeam`.

- [ ] **Step 3: Add imports + the EdgeRuntime declaration**

In `supabase/functions/track-visit/index.ts`, replace the single import line:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```

with:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendExpoPush } from "../_shared/expo-push.ts";
import { buildVenueScanMessage } from "../_shared/scan-message.mjs";

// Provided by the Supabase Edge runtime; keeps background work alive after the
// response is sent. Declared for the type-checker.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
```

- [ ] **Step 4: Widen the venue select**

Change the venue query (currently `select("id")`) and its result cast:

```ts
  const venueQuery = supabase.from("venues").select("id, org_id, name").eq("status", "published").limit(1);
  const { data: venues, error: venueErr } = await (
    venueIdParam ? venueQuery.eq("id", venueIdParam) : venueQuery.eq("slug", venueSlug as string)
  );

  if (venueErr) return json({ ok: false, error: "Venue lookup failed" }, 500);
  const venue = (venues as Array<{ id: string; org_id: string; name: string }> | null)?.[0];
  if (!venue) return json({ ok: false, error: "Unknown venue" }, 404);
```

- [ ] **Step 5: Add `notifyVenueTeam` and fire it after the insert**

Add this function just above `Deno.serve(...)` (e.g., after the `toFiniteNumber` helper):

```ts
/**
 * Push to the venue's owners + managers that a visit was recorded. Runs in the
 * background (EdgeRuntime.waitUntil), so any failure here never affects the
 * track-visit response. Respects the per-user push + venue-scan opt-outs
 * (a missing user_preferences row counts as opted-in).
 */
async function notifyVenueTeam(
  supabase: ReturnType<typeof createClient>,
  args: { venueId: string; orgId: string; venueName: string; source: string },
): Promise<void> {
  try {
    const { venueId, orgId, venueName, source } = args;

    const { data: members } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .in("role", ["owner", "manager"]);
    const memberIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))];
    if (memberIds.length === 0) return;

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("user_id, notifications_push, notifications_venue_scans")
      .in("user_id", memberIds);
    const optedOut = new Set(
      (prefs ?? [])
        .filter(
          (p: { notifications_push?: boolean; notifications_venue_scans?: boolean }) =>
            p.notifications_push === false || p.notifications_venue_scans === false,
        )
        .map((p: { user_id: string }) => p.user_id),
    );
    const recipientIds = memberIds.filter((id) => !optedOut.has(id));
    if (recipientIds.length === 0) return;

    const { data: tokenRows } = await supabase
      .from("user_push_tokens")
      .select("expo_push_token")
      .in("user_id", recipientIds);
    const tokens = [
      ...new Set(
        (tokenRows ?? [])
          .map((t: { expo_push_token: string }) => t.expo_push_token)
          .filter((tok) => typeof tok === "string" && tok.startsWith("ExponentPushToken")),
      ),
    ];
    if (tokens.length === 0) return;

    const { title, body } = buildVenueScanMessage(source, venueName);
    await sendExpoPush(
      tokens.map((to) => ({
        to,
        title,
        body,
        sound: "default" as const,
        data: { type: "venue", venueId },
      })),
    );
  } catch (err) {
    console.error(
      "[track-visit] venue-team push failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
```

Then change the success tail from:

```ts
  if (insertErr) return json({ ok: false, error: "Insert failed" }, 500);

  return json({ ok: true });
```

to:

```ts
  if (insertErr) return json({ ok: false, error: "Insert failed" }, 500);

  // Notify the venue's owners/managers in the background — never blocks the response.
  EdgeRuntime.waitUntil(
    notifyVenueTeam(supabase, {
      venueId,
      orgId: venue.org_id,
      venueName: venue.name,
      source,
    }),
  );

  return json({ ok: true });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/venue-scan-notify.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/track-visit/index.ts test/venue-scan-notify.test.mjs
git commit -m "feat(venue-scan-notify): track-visit pushes recorded visits to the venue team"
```

---

## Task 5: Full verification + deploy (gated)

**Files:** none (verification + release).

- [ ] **Step 1: Run the full suite (CI parity)**

Run: `npm test`
Expected: PASS, 0 failures — the existing suite plus the 9 new venue-scan tests. (CI runs Node 20; all new test-imported code is `.mjs`/`readFileSync`, so no type-stripping is required.)

- [ ] **Step 2: Deno-check the edge functions (optional but recommended)**

If Deno is installed: `deno check supabase/functions/track-visit/index.ts supabase/functions/notify-upcoming-happy-hours/index.ts`
Expected: no type errors. (If Deno is not installed, skip — CI does not type-check Deno; rely on the structure tests + live verification.)

- [ ] **Step 3: Push branch, open PR, confirm CI is green**

```bash
git push -u origin feat/venue-scan-notify
gh pr create --base master --title "feat(venue-scan-notify): venue-team scan push" --body "Implements the venue-team scan push (epic sub-project 2). track-visit notifies owners/managers on a recorded attribution event via EdgeRuntime.waitUntil; shared expo-push sender; notifications_venue_scans opt-out column."
```
Wait for CI: `gh pr checks <PR>` → `node` + `supabase-migrations` must be **green** before this is considered passing.

- [ ] **Step 4: Deploy (outward-facing — get explicit human go-ahead first)**

> ⚠️ This ships to production attribution traffic + real push tokens. Confirm before running.

```bash
# Apply the migration to the linked project:
supabase db push
# Deploy the touched functions:
supabase functions deploy track-visit
supabase functions deploy notify-upcoming-happy-hours
```

- [ ] **Step 5: Live verification**

With a venue whose org you own (owner/manager) and a device with a push token: trigger a recorded visit (scan the QR / `POST track-visit` with a fresh `session_id`), confirm the owner/manager device receives "New … at {venue}" and tapping opens the venue. Confirm a **deduped** repeat (same session within 4h) does NOT send a second push. Record PASS/FAIL.

---

## Self-Review notes

- **Spec coverage:** inline waitUntil hook after recorded insert (Task 4); all-four-source message (Task 2, generic fallback covers push_click/organic); owners+managers recipients (Task 4); `notifications_venue_scans` column + respect, missing=on (Task 1 + Task 4); shared sender extracted + notify-upcoming refactored (Task 3); payload `type:"venue"` for the existing mobile tap handler (Task 4); tests via pure unit + readFileSync (all tasks); gated deploy + live check (Task 5). All spec sections mapped.
- **Type/name consistency:** `buildVenueScanMessage(source, venueName) → {title, body}`, `sendExpoPush(ExpoPushMessage[]) → number`, `notifyVenueTeam(supabase, {venueId, orgId, venueName, source})`, venue select `"id, org_id, name"`, pref columns `notifications_push` + `notifications_venue_scans`, payload `{ type: "venue", venueId }` — consistent across tasks and matching `useNotificationNavigation`.
- **Known follow-ups (out of scope):** Profile-screen toggle for `notifications_venue_scans`; per-venue push throttling.
```
