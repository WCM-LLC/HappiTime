# Web "Scan activity" Analytics Element Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Scan activity" card to the venue admin page (visible to owner/manager/admin/editor/host) showing scan/check-in totals by window + source and a recent list, server-rendered from `venue_attribution_events`.

**Architecture:** A pure, unit-tested `.mjs` util (`summarizeScans` + `computeWindows` + `formatRelativeTime`, with a `.d.ts` for the web app's TS) — `.mjs` so CI's Node 20 can execute the tests. The venue page server-component does an app-gated service-role read of the venue's last-30d events, runs the pure aggregator, and renders a presentational `<VenueScanAnalytics>`. **No migration (zero drift), no native change.**

**Tech Stack:** Next.js App Router (server components), Supabase JS (service client), Tailwind (existing design tokens), `node:test` (CI Node 20).

**Spec:** `docs/superpowers/specs/2026-05-31-venue-scan-analytics-design.md`

---

## File Structure

- **Create** `apps/web/src/utils/scan-analytics.mjs` — pure `summarizeScans`, `computeWindows`, `formatRelativeTime`.
- **Create** `apps/web/src/utils/scan-analytics.d.ts` — types for the above (web app uses strict TS; `.mjs` has no inline types).
- **Create** `test/scan-analytics.test.mjs` — node:test for the pure util.
- **Create** `apps/web/src/components/VenueScanAnalytics.tsx` — presentational card.
- **Modify** `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx` — fetch + render (gated by `canEditMenuItems`).

---

## Task 1: Pure analytics util + unit tests

**Files:**
- Create: `apps/web/src/utils/scan-analytics.mjs`
- Create: `apps/web/src/utils/scan-analytics.d.ts`
- Test: `test/scan-analytics.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/scan-analytics.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeScans, computeWindows, formatRelativeTime } from "../apps/web/src/utils/scan-analytics.mjs";

const W = (now) => ({
  todayStart: new Date(now - 3 * 3600 * 1000).toISOString(), // 3h ago
  weekStart: new Date(now - 7 * 24 * 3600 * 1000).toISOString(),
  monthStart: new Date(now - 30 * 24 * 3600 * 1000).toISOString(),
});
const at = (now, msAgo, source) => ({ source, created_at: new Date(now - msAgo).toISOString() });

test("summarizeScans buckets by window and source, newest-first recent", () => {
  const now = Date.parse("2026-05-31T12:00:00Z");
  const events = [
    at(now, 1 * 3600 * 1000, "qr"),               // 1h -> today,week,month
    at(now, 5 * 3600 * 1000, "qr"),               // 5h -> week,month (todayStart=3h)
    at(now, 3 * 24 * 3600 * 1000, "app_checkin"), // 3d -> week,month
    at(now, 10 * 24 * 3600 * 1000, "organic"),    // 10d -> month
    at(now, 40 * 24 * 3600 * 1000, "qr"),         // 40d -> none
  ];
  const s = summarizeScans(events, W(now));
  assert.equal(s.today, 1);
  assert.equal(s.week, 3);
  assert.equal(s.month, 4);
  assert.deepEqual(s.bySource, { qr: 3, app_checkin: 1, push_click: 0, organic: 1 });
  assert.equal(s.recent[0].created_at, new Date(now - 1 * 3600 * 1000).toISOString());
});

test("summarizeScans ignores unknown source in bySource but still counts windows", () => {
  const now = Date.parse("2026-05-31T12:00:00Z");
  const s = summarizeScans([at(now, 1000, "weird"), at(now, 2000, "qr")], W(now));
  assert.equal(s.month, 2);
  assert.deepEqual(s.bySource, { qr: 1, app_checkin: 0, push_click: 0, organic: 0 });
});

test("summarizeScans caps recent at 8", () => {
  const now = Date.parse("2026-05-31T12:00:00Z");
  const events = Array.from({ length: 12 }, (_, i) => at(now, (i + 1) * 1000, "qr"));
  assert.equal(summarizeScans(events, W(now)).recent.length, 8);
});

test("summarizeScans empty input -> zeros", () => {
  const now = Date.parse("2026-05-31T12:00:00Z");
  const s = summarizeScans([], W(now));
  assert.deepEqual({ t: s.today, w: s.week, m: s.month, r: s.recent.length }, { t: 0, w: 0, m: 0, r: 0 });
  assert.deepEqual(s.bySource, { qr: 0, app_checkin: 0, push_click: 0, organic: 0 });
});

test("computeWindows: today within last 24h, windows ordered", () => {
  const now = new Date("2026-05-31T18:30:00Z");
  const w = computeWindows("America/Chicago", now);
  assert.ok(new Date(w.todayStart) <= now);
  assert.ok(now.getTime() - new Date(w.todayStart).getTime() <= 24 * 3600 * 1000);
  assert.ok(new Date(w.weekStart) < new Date(w.todayStart));
  assert.ok(new Date(w.monthStart) < new Date(w.weekStart));
});

test("computeWindows: invalid timezone falls back without throwing", () => {
  const w = computeWindows("Not/AZone", new Date("2026-05-31T18:30:00Z"));
  assert.equal(typeof w.todayStart, "string");
});

test("formatRelativeTime", () => {
  const now = new Date("2026-05-31T12:00:00Z");
  assert.match(formatRelativeTime(new Date(now.getTime() - 30 * 1000).toISOString(), now), /just now/);
  assert.equal(formatRelativeTime(new Date(now.getTime() - 5 * 60 * 1000).toISOString(), now), "5m ago");
  assert.equal(formatRelativeTime(new Date(now.getTime() - 3 * 3600 * 1000).toISOString(), now), "3h ago");
  assert.equal(formatRelativeTime(new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(), now), "2d ago");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scan-analytics.test.mjs`
Expected: FAIL — cannot resolve `../apps/web/src/utils/scan-analytics.mjs`.

- [ ] **Step 3: Create the util**

Create `apps/web/src/utils/scan-analytics.mjs`:

```js
// apps/web/src/utils/scan-analytics.mjs
//
// Pure helpers for the venue "Scan activity" card. Plain ESM (.mjs, see the
// scan-analytics.d.ts for types) so CI's Node 20 can execute the unit tests
// directly (no type-stripping). No I/O — windows and `now` are passed in.

const RECENT_LIMIT = 8;

/** { todayStart, weekStart, monthStart } ISO boundaries for a venue timezone + now. */
export function computeWindows(timezone, now) {
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const monthStart = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  // Start of the current calendar day in the venue's timezone = now minus the
  // seconds elapsed since local midnight (robust across DST; no offset tables).
  let secsIntoDay =
    now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(now);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    secsIntoDay = get("hour") * 3600 + get("minute") * 60 + get("second");
  } catch {
    // invalid/missing timezone — keep the UTC-day fallback computed above
  }
  return {
    todayStart: new Date(now.getTime() - secsIntoDay * 1000).toISOString(),
    weekStart: weekStart.toISOString(),
    monthStart: monthStart.toISOString(),
  };
}

/** Aggregate the venue's last-30d events into window totals, per-source, and recent. */
export function summarizeScans(events, windows) {
  const bySource = { qr: 0, app_checkin: 0, push_click: 0, organic: 0 };
  const todayMs = new Date(windows.todayStart).getTime();
  const weekMs = new Date(windows.weekStart).getTime();
  const monthMs = new Date(windows.monthStart).getTime();
  let today = 0;
  let week = 0;
  let month = 0;
  const sorted = [...(events ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  for (const e of sorted) {
    const tMs = new Date(e.created_at).getTime();
    if (tMs >= monthMs) month++;
    if (tMs >= weekMs) week++;
    if (tMs >= todayMs) today++;
    if (Object.prototype.hasOwnProperty.call(bySource, e.source)) bySource[e.source]++;
  }
  return {
    today,
    week,
    month,
    bySource,
    recent: sorted.slice(0, RECENT_LIMIT).map((e) => ({ source: e.source, created_at: e.created_at })),
  };
}

/** Short relative time like "just now", "5m ago", "3h ago", "2d ago". */
export function formatRelativeTime(fromISO, now) {
  const s = Math.max(0, Math.floor((now.getTime() - new Date(fromISO).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
```

Create `apps/web/src/utils/scan-analytics.d.ts`:

```ts
export interface ScanWindows {
  todayStart: string;
  weekStart: string;
  monthStart: string;
}

export interface ScanEvent {
  source: string;
  created_at: string;
}

export interface ScanSummary {
  today: number;
  week: number;
  month: number;
  bySource: { qr: number; app_checkin: number; push_click: number; organic: number };
  recent: ScanEvent[];
}

export declare function computeWindows(timezone: string, now: Date): ScanWindows;
export declare function summarizeScans(events: ScanEvent[], windows: ScanWindows): ScanSummary;
export declare function formatRelativeTime(fromISO: string, now: Date): string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/scan-analytics.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: PASS — existing suites + the 7 new tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/utils/scan-analytics.mjs apps/web/src/utils/scan-analytics.d.ts test/scan-analytics.test.mjs
git commit -m "feat(scan-analytics): pure summarizeScans/computeWindows util + tests"
```

---

## Task 2: `<VenueScanAnalytics>` component

**Files:**
- Create: `apps/web/src/components/VenueScanAnalytics.tsx`
- Test: `test/scan-analytics.test.mjs` (append a readFileSync assertion)

- [ ] **Step 1: Write the failing test**

Append to `test/scan-analytics.test.mjs` — first add at the top (with the other imports):

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
```

Then append:

```js
test("VenueScanAnalytics renders windows/sources/empty state and uses the util", () => {
  const src = read("apps/web/src/components/VenueScanAnalytics.tsx");
  assert.match(src, /Scan activity/);
  assert.match(src, /from ['"]@\/utils\/scan-analytics['"]/);
  assert.match(src, /No scans yet/);
  assert.match(src, /last 30 days/);
  assert.match(src, /Check-in/); // app_checkin label
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scan-analytics.test.mjs`
Expected: FAIL — `VenueScanAnalytics.tsx` does not exist.

- [ ] **Step 3: Create the component**

Create `apps/web/src/components/VenueScanAnalytics.tsx`:

```tsx
import { formatRelativeTime, type ScanSummary } from '@/utils/scan-analytics';

const SOURCE_LABELS: Record<string, string> = {
  qr: 'QR',
  app_checkin: 'Check-in',
  push_click: 'Push',
  organic: 'Organic',
};

const SOURCE_ORDER = ['qr', 'app_checkin', 'push_click', 'organic'] as const;

export function VenueScanAnalytics({ summary }: { summary: ScanSummary }) {
  const now = new Date();
  const { today, week, month, bySource, recent } = summary;

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
      <div className="mb-4">
        <h2 className="text-heading-sm font-semibold text-foreground">Scan activity</h2>
        <p className="text-body-sm text-muted mt-0.5">
          Visits attributed to this venue — QR scans, check-ins, and opens.
        </p>
      </div>

      {month === 0 ? (
        <p className="text-body-sm text-muted">
          No scans yet — print your QR code (above) and place it in your venue.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm text-foreground">
            <span><span className="font-semibold">{today}</span> <span className="text-muted">today</span></span>
            <span><span className="font-semibold">{week}</span> <span className="text-muted">last 7 days</span></span>
            <span><span className="font-semibold">{month}</span> <span className="text-muted">last 30 days</span></span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SOURCE_ORDER.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full bg-brand-subtle px-2.5 py-1 text-caption font-medium text-brand-text"
              >
                {SOURCE_LABELS[s]} {bySource[s]}
              </span>
            ))}
          </div>

          {recent.length > 0 ? (
            <ul className="mt-4 divide-y divide-border">
              {recent.map((e, i) => (
                <li key={i} className="flex items-center justify-between py-1.5 text-body-sm">
                  <span className="text-foreground">{SOURCE_LABELS[e.source] ?? e.source}</span>
                  <span className="text-muted">{formatRelativeTime(e.created_at, now)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

export default VenueScanAnalytics;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/scan-analytics.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck the web app**

Run: `cd apps/web && npx tsc -p tsconfig.json --noEmit`
Expected: no errors — confirms `@/utils/scan-analytics` resolves to the `.d.ts` and the component types.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/VenueScanAnalytics.tsx test/scan-analytics.test.mjs
git commit -m "feat(scan-analytics): VenueScanAnalytics card component"
```

---

## Task 3: Wire into the venue admin page

**Files:**
- Modify: `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx`
- Test: `test/scan-analytics.test.mjs` (append)

The page is an async server component. It already has `createServiceClient` imported (line ~11), derives `canEditMenuItems` (~line 280), fetches `venue` via `fetchVenueById` (~line 281), and computes `qrSlug` right after (~line 290). `venue.timezone` is available. The QR section is `SECTION 4A — QR CODE` (~line 1617), followed by `SECTION 4B — STAFF MANAGEMENT` (~line 1652).

- [ ] **Step 1: Write the failing test**

Append to `test/scan-analytics.test.mjs`:

```js
test("venue page reads scan events (gated) and renders the analytics card", () => {
  const src = read("apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx");
  assert.match(src, /from ['"]@\/components\/VenueScanAnalytics['"]/);
  assert.match(src, /venue_attribution_events/);
  assert.match(src, /computeWindows\(/);
  assert.match(src, /summarizeScans\(/);
  assert.match(src, /canEditMenuItems && scanSummary/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scan-analytics.test.mjs`
Expected: FAIL — page doesn't import the component / query the events yet.

- [ ] **Step 3: Add the imports**

In `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx`, after the line
`import { SIZE_PRESETS } from '@happitime/venue-qr';` add:

```ts
import { VenueScanAnalytics } from '@/components/VenueScanAnalytics';
import { summarizeScans, computeWindows, type ScanSummary, type ScanEvent } from '@/utils/scan-analytics';
```

- [ ] **Step 4: Fetch + summarize (gated)**

Find the line:
```ts
  const qrSlug = (qrVenue?.slug as string | null) ?? null;
```
and insert immediately after it:

```ts

  // Scan activity for venue staff (owner/manager/admin/editor/host). venue_attribution_events
  // is RLS-locked, so read with the service client — gated by the app-level canEditMenuItems
  // check (the only authorization needed; we query just this one venue's events).
  let scanSummary: ScanSummary | null = null;
  if (canEditMenuItems) {
    const scanWindows = computeWindows(venue?.timezone ?? 'UTC', new Date());
    const { data: scanEvents } = await createServiceClient()
      .from('venue_attribution_events')
      .select('source, created_at')
      .eq('venue_id', venueId)
      .gte('created_at', scanWindows.monthStart)
      .order('created_at', { ascending: false });
    scanSummary = summarizeScans((scanEvents ?? []) as ScanEvent[], scanWindows);
  }
```

- [ ] **Step 5: Render the card**

Find the `SECTION 4B — STAFF MANAGEMENT` comment block:
```tsx
        {/* ══════════════════════════════════════════════
            SECTION 4B — STAFF MANAGEMENT (Admin only)
        ══════════════════════════════════════════════ */}
```
and insert this BEFORE it:

```tsx
        {/* ══════════════════════════════════════════════
            SECTION 4S — SCAN ACTIVITY
        ══════════════════════════════════════════════ */}
        {canEditMenuItems && scanSummary ? (
          <VenueScanAnalytics summary={scanSummary} />
        ) : null}

```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/scan-analytics.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc -p tsconfig.json --noEmit`
Expected: no errors. (If `venue?.timezone` errors as untyped, change it to `(venue as { timezone?: string } | null)?.timezone ?? 'UTC'`.)

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx" test/scan-analytics.test.mjs
git commit -m "feat(scan-analytics): render Scan activity card on the venue page"
```

---

## Task 4: Verification

**Files:** none (verification).

- [ ] **Step 1: Full suite (CI parity)**

Run: `npm test`
Expected: PASS, 0 failures (incl. the 9 new scan-analytics tests). CI runs Node 20; the test-imported util is `.mjs`, so no type-stripping is needed.

- [ ] **Step 2: Web build (confirms `.mjs` resolution + page/component compile)**

Run: `npm run -w web build`
Expected: compiles. The venue route builds with the new card. (If `@/utils/scan-analytics` fails to resolve to the `.mjs` in webpack, import it in the component/page with the explicit `.mjs` extension, or as a fallback move the executable test to assert via readFileSync — but the `@happitime/venue-qr` `.mjs` already resolves in this build, so extensionless should work.)

- [ ] **Step 3: Push, open PR, confirm CI green**

```bash
git push -u origin feat/venue-scan-analytics
gh pr create --base master --title "feat(scan-analytics): web Scan activity element on the venue page" --body "Adds a server-rendered Scan activity card (owner/manager/admin/editor/host) on the venue admin page: window totals + per-source counts + recent list from venue_attribution_events. Pure summarizeScans util (unit-tested). App-gated service read — no migration (zero drift), no native change."
```
Wait for `gh pr checks <PR>` → `node` + `supabase-migrations` **green** before considering it passing.

- [ ] **Step 4: Manual check**

Load `/orgs/{orgId}/venues/{venueId}` as owner/manager/host for a venue that has attribution events; confirm the "Scan activity" card shows correct counts (cross-check with `select source, count(*) from venue_attribution_events where venue_id = … group by source`). Load a venue with no events → empty state. Confirm the card is hidden for a non-staff user. Record PASS/FAIL.

---

## Self-Review notes

- **Spec coverage:** pure `summarizeScans`/`computeWindows`/`formatRelativeTime` + tests (Task 1); presentational card with windows/sources/recent/empty state (Task 2); app-gated service read + venue-tz windows + render gated by `canEditMenuItems` (Task 3); build/CI/manual verification (Task 4). No migration (zero drift) and no native change, per the spec. All spec sections mapped.
- **Type consistency:** `computeWindows(timezone, now) → ScanWindows`, `summarizeScans(ScanEvent[], ScanWindows) → ScanSummary` (`{today, week, month, bySource:{qr,app_checkin,push_click,organic}, recent: ScanEvent[]}`), `formatRelativeTime(fromISO, now)` — identical across the `.mjs`, the `.d.ts`, the component, and the page.
- **Known follow-ups (out of scope):** real-time updates + owner-scoped RLS; charts/trends; org-level rollup.
```
