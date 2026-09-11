# Per-Venue Events & Specials Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app per-venue Events & Specials page; "More info" routes there instead of the venue website; menus hint moved to the actual tap targets.

**Architecture:** New `VenueEventsScreen` consuming the existing `useVenueEvents` hook, shared display helpers extracted to `lib/eventDisplay.ts`, link rewiring on two screens, and one branch change in `resolveNotificationTarget`. No backend changes.

**Tech Stack:** React Native (Expo), TypeScript, existing repo static-guard test pattern (`node --test test/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-08-05-venue-events-page-design.md`

## Global Constraints

- CI runs `node --test test/*.test.mjs` at repo root on Node 20. Mobile validation is local: `npx tsc --noEmit` from `apps/mobile`.
- `apps/mobile` tsconfig has `allowJs: false` — shared TS goes in `.ts` files consumed only by TS; never import `.ts` from `.mjs` tests (guards grep source text instead).
- "Get tickets" (`ticket_url`) stays an external `Linking.openURL` link everywhere.
- The venue website (`external_url`) is reachable ONLY as a "Visit website" action on the new page — never labeled "More info".
- Exact copy: page title fallback "Events & Specials"; group headers "Recurring specials & events" and "Upcoming"; empty state "No published events or specials yet."; see-all link "See all events & specials →"; menus hint "Tap here to see menus".
- Push `data` payload contract is unchanged (senders untouched); only client routing changes.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Work on branch `feat/venue-events-page` created from `origin/master`.

---

### Task 1: Extract shared event display helpers

**Files:**
- Create: `apps/mobile/src/lib/eventDisplay.ts`
- Modify: `apps/mobile/src/screens/EventCalendarScreen.tsx` (delete private copies at ~lines 27-56; import instead)
- Modify: `apps/mobile/src/screens/VenuePreviewScreen.tsx` (delete private copies at ~lines 44-70; import instead)

**Interfaces:**
- Produces: `formatEventDate(dateStr: string): string`, `formatRecurrenceRule(rule: string | null, startTime: string): string`, `EVENT_TYPE_LABELS: Record<string, string>` — exact code moved verbatim from `EventCalendarScreen.tsx`.

- [ ] **Step 1: Create `apps/mobile/src/lib/eventDisplay.ts`**

```ts
// Shared display helpers for venue events. Extracted verbatim from
// EventCalendarScreen (which had a duplicate copy in VenuePreviewScreen)
// so VenueEventsScreen can reuse them without a third copy.

export function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dayName}, ${month} ${day} at ${time}`;
}

export function formatRecurrenceRule(rule: string | null, startTime: string): string {
  const DOW_MAP: Record<string, string> = {
    SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat",
  };
  const time = new Date(startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (!rule) return `Recurring at ${time}`;
  const match = rule.match(/BYDAY=([A-Z,]+)/);
  if (!match) return `Recurring at ${time}`;
  const days = match[1].split(",").map((d) => DOW_MAP[d] ?? d).join(", ");
  return `Every ${days} at ${time}`;
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  special: "Special",
  live_music: "Live Music",
  trivia: "Trivia",
  sports: "Sports",
  other: "Other",
};
```

- [ ] **Step 2: Update both screens to import**

In `EventCalendarScreen.tsx`: delete the three private definitions (`formatEventDate`, `formatRecurrenceRule`, `EVENT_TYPE_LABELS` — NOT the separate `DOW_RRULE` recurrence-expansion helpers below them) and add:

```ts
import { EVENT_TYPE_LABELS, formatEventDate, formatRecurrenceRule } from "../lib/eventDisplay";
```

In `VenuePreviewScreen.tsx`: delete its duplicate three definitions (~lines 44-70) and add the same import.

- [ ] **Step 3: Verify**

Run from `apps/mobile`: `npx tsc --noEmit` — expect clean.
Run from repo root: `npm test` — expect 374 pass / 0 fail (no guard greps these helper names today; if one fails, read it before touching it).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/eventDisplay.ts apps/mobile/src/screens/EventCalendarScreen.tsx apps/mobile/src/screens/VenuePreviewScreen.tsx
git commit -m "refactor(mobile): extract shared event display helpers to lib/eventDisplay"
```

---

### Task 2: VenueEventsScreen + route registration

**Files:**
- Create: `apps/mobile/src/screens/VenueEventsScreen.tsx`
- Modify: `apps/mobile/src/navigation/types.ts` (add route to `RootStackParamList`)
- Modify: `apps/mobile/src/navigation/AppNavigator.tsx` (register screen)

**Interfaces:**
- Consumes: `useVenueEvents(venueId)` (existing — returns `{ data, loading, error, refresh? }`; check the hook's actual return keys before use), `eventDisplay` helpers (Task 1).
- Produces: route `VenueEvents: { venueId: string; venueName?: string }` — Tasks 3 and 4 navigate to it by this exact name/params.

- [ ] **Step 1: Add the route type**

In `apps/mobile/src/navigation/types.ts`, inside `RootStackParamList` (next to `HappyHourDetail`):

```ts
  VenueEvents: { venueId: string; venueName?: string };
```

- [ ] **Step 2: Create `apps/mobile/src/screens/VenueEventsScreen.tsx`**

```tsx
// Per-venue Events & Specials page (spec 2026-08-05). The in-app home for a
// venue's recurring specials and upcoming events — "More info" links land
// here instead of bouncing to the venue website.
import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useVenueEvents, type VenueEventItem } from "../hooks/useVenueEvents";
import { EVENT_TYPE_LABELS, formatEventDate, formatRecurrenceRule } from "../lib/eventDisplay";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import type { RootStackParamList } from "../navigation/types";

const EventRow: React.FC<{ ev: VenueEventItem }> = ({ ev }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.typeBadge}>
        <Text style={styles.typeBadgeText}>{EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}</Text>
      </View>
      {ev.price_info ? <Text style={styles.price}>{ev.price_info}</Text> : null}
    </View>
    <Text style={styles.title}>{ev.title}</Text>
    <Text style={styles.date}>
      {ev.is_recurring ? formatRecurrenceRule(ev.recurrence_rule, ev.starts_at) : formatEventDate(ev.starts_at)}
      {ev.ends_at
        ? ` – ${new Date(ev.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : ""}
    </Text>
    {ev.description ? <Text style={styles.desc}>{ev.description}</Text> : null}
    {ev.ticket_url || ev.external_url ? (
      <View style={styles.links}>
        {ev.ticket_url ? (
          <Pressable onPress={() => Linking.openURL(ev.ticket_url!)}>
            <Text style={styles.link}>Get tickets</Text>
          </Pressable>
        ) : null}
        {ev.external_url ? (
          <Pressable onPress={() => Linking.openURL(ev.external_url!)}>
            <Text style={styles.linkSecondary}>Visit website</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null}
  </View>
);

export const VenueEventsScreen: React.FC = () => {
  const route = useRoute();
  const { venueId, venueName } = (route.params as RootStackParamList["VenueEvents"]) ?? { venueId: "" };
  const { data: events, loading } = useVenueEvents(venueId || null);

  const recurring = events.filter((e) => e.is_recurring);
  const upcoming = events.filter((e) => !e.is_recurring);

  if (loading) return <LoadingSpinner />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>{venueName || "Events & Specials"}</Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>No published events or specials yet.</Text>
      ) : (
        <>
          {recurring.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Recurring specials & events</Text>
              {recurring.map((ev) => <EventRow key={ev.id} ev={ev} />)}
            </>
          ) : null}
          {upcoming.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Upcoming</Text>
              {upcoming.map((ev) => <EventRow key={ev.id} ev={ev} />)}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  pageTitle: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  empty: { fontSize: 14, color: colors.textMuted, marginTop: spacing.md },
  card: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 },
  typeBadge: { backgroundColor: colors.primaryLight ?? colors.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 11, fontWeight: "700", color: colors.text },
  price: { fontSize: 12, color: colors.textMuted },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  date: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  desc: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  links: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  link: { fontSize: 13, fontWeight: "600", color: colors.primary },
  linkSecondary: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
});
```

Adjust badge styling to match `EventCalendarScreen`'s `eventTypeBadge`/`eventTypeBadgeText` values if `colors.primaryLight` does not exist — copy those two style objects verbatim from the calendar's StyleSheet instead of inventing colors. Verify `useVenueEvents`' exported item type name (`VenueEventItem`) and export it from the hook if it is not already exported.

- [ ] **Step 3: Register the screen**

In `AppNavigator.tsx`, next to the `HappyHourDetail` registration, copying its exact `options` shape:

```tsx
<Stack.Screen
  name="VenueEvents"
  component={VenueEventsScreen}
  options={{
    headerShown: true,
    title: "Events & Specials",
    headerBackTitle: "Back",
    headerTintColor: colors.text,
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
    headerTitleStyle: { fontSize: 17, fontWeight: "600" },
  }}
/>
```

(plus the `import { VenueEventsScreen } from "../screens/VenueEventsScreen";` at the top).

- [ ] **Step 4: Verify** — `npx tsc --noEmit` from `apps/mobile`, expect clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/VenueEventsScreen.tsx apps/mobile/src/navigation/types.ts apps/mobile/src/navigation/AppNavigator.tsx
git commit -m "feat(mobile): per-venue Events & Specials screen"
```

---

### Task 3: Rewire Event Calendar "More info" + event push routing (TDD)

**Files:**
- Create: `test/venue-events-page.test.mjs`
- Modify: `apps/mobile/src/screens/EventCalendarScreen.tsx` (EventCard links block ~lines 228-241, EventCard props ~line 177, renderItem ~line 372)
- Modify: `apps/mobile/src/lib/notificationTarget.mjs` (event branch)

**Interfaces:**
- Consumes: route `VenueEvents { venueId, venueName? }` (Task 2).
- Produces: resolver `event` branch returns `{ screen: "VenueEvents", params: { venueId } }` when `data.venueId` is a string, else the existing `{ screen: "EventCalendar", params: undefined }`.

- [ ] **Step 1: Write the failing static guards**

Create `test/venue-events-page.test.mjs` (mirror the read-helper idiom of `test/mobile-notifications-inbox.test.mjs`):

```js
// Static guards for the per-venue Events & Specials page
// (spec docs/superpowers/specs/2026-08-05-venue-events-page-design.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("Event Calendar More info navigates in-app to VenueEvents, never the venue website", () => {
  const src = read("apps/mobile/src/screens/EventCalendarScreen.tsx");
  assert.doesNotMatch(src, /Linking\.openURL\(ev\.external_url/);
  assert.match(src, /navigate\("VenueEvents"/);
  assert.match(src, /Linking\.openURL\(ev\.ticket_url/); // tickets stay external
});

test("event notifications route to the venue's events page with calendar fallback", () => {
  const resolver = read("apps/mobile/src/lib/notificationTarget.mjs");
  const evIdx = resolver.indexOf('type === "event"');
  assert.ok(evIdx > 0);
  const branch = resolver.slice(evIdx, resolver.indexOf("return null"));
  assert.match(branch, /screen:\s*"VenueEvents"/);
  assert.match(branch, /screen:\s*"EventCalendar"/); // old payloads keep working
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/venue-events-page.test.mjs`
Expected: both tests FAIL (calendar still calls `Linking.openURL(ev.external_url!)`; resolver has no `VenueEvents`).

- [ ] **Step 3: Rewire the calendar card**

In `EventCalendarScreen.tsx`:

(a) EventCard signature gains a callback:

```tsx
const EventCard: React.FC<{ event: UpcomingEvent; onPress: () => void; onMoreInfo: () => void }> = ({ event: ev, onPress, onMoreInfo }) => {
```

(b) Replace the links block (currently gated on `ev.external_url || ev.ticket_url`):

```tsx
      <View style={styles.eventLinks}>
        <Pressable onPress={onMoreInfo}>
          <Text style={styles.eventLink}>More info</Text>
        </Pressable>
        {ev.ticket_url ? (
          <Pressable onPress={() => Linking.openURL(ev.ticket_url!)}>
            <Text style={styles.eventLink}>Get tickets</Text>
          </Pressable>
        ) : null}
      </View>
```

(c) At the render site (~line 372), pass the new prop alongside the existing `onPress`:

```tsx
onMoreInfo={() =>
  navigation.navigate("VenueEvents", {
    venueId: item.venue_id,
    venueName: item.venues?.name ?? undefined,
  })
}
```

- [ ] **Step 4: Update the resolver**

In `notificationTarget.mjs`, replace the `event` branch:

```js
  if (type === "event") {
    // Land on the venue's in-app Events & Specials page when the payload
    // carries the venue; old payloads fall back to the calendar.
    if (typeof data.venueId === "string") {
      return { screen: "VenueEvents", params: { venueId: data.venueId } };
    }
    return { screen: "EventCalendar", params: undefined };
  }
```

Also update the payload-contract comment at the top of the file if it names the event target.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/venue-events-page.test.mjs` → 2/2 PASS.
Run: `npx tsc --noEmit` from `apps/mobile` → clean.
Run: `npm test` from repo root → no regressions (watch `test/mobile-notifications-inbox.test.mjs` and `test/shared-itinerary-access.test.mjs`, which also grep the resolver).

- [ ] **Step 6: Commit**

```bash
git add test/venue-events-page.test.mjs apps/mobile/src/screens/EventCalendarScreen.tsx apps/mobile/src/lib/notificationTarget.mjs
git commit -m "feat(mobile): More info routes in-app to VenueEvents; event pushes land on the venue page"
```

---

### Task 4: Venue Preview trim + see-all link + menus copy (TDD)

**Files:**
- Modify: `test/venue-events-page.test.mjs` (append guards)
- Modify: `apps/mobile/src/screens/VenuePreviewScreen.tsx` (events section ~lines 346-401, menus subtitle ~line 430, windows list ~line 483)

**Interfaces:**
- Consumes: route `VenueEvents { venueId, venueName? }` (Task 2). `venueName` and `navigation` are already in scope in this screen.

- [ ] **Step 1: Append failing guards**

```js
test("Venue Preview caps inline events at 3 with a see-all link; no website More info", () => {
  const src = read("apps/mobile/src/screens/VenuePreviewScreen.tsx");
  assert.match(src, /events\.slice\(0,\s*3\)/);
  assert.match(src, /See all events & specials →/);
  assert.match(src, /navigate\("VenueEvents"/);
  assert.doesNotMatch(src, /Linking\.openURL\(ev\.external_url/);
});

test("menus hint says 'Tap here to see menus' and sits with the windows list", () => {
  const src = read("apps/mobile/src/screens/VenuePreviewScreen.tsx");
  assert.doesNotMatch(src, /Tap below to see Menus/i);
  const hintIdx = src.indexOf("Tap here to see menus");
  const windowsIdx = src.indexOf("data={windowsForVenue}");
  assert.ok(hintIdx > 0 && windowsIdx > 0, "hint and windows list must both exist");
  // The hint renders in the windows-list region, not up by the check-in buttons:
  // it must appear AFTER the check-in button block in source order.
  const checkInIdx = src.indexOf("I'm here 🍻");
  assert.ok(hintIdx > checkInIdx, "hint must come after the check-in buttons");
  assert.ok(hintIdx < windowsIdx, "hint must come before the windows list");
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/venue-events-page.test.mjs`: the two new tests FAIL.

- [ ] **Step 3: Trim the events section**

In the `if (events.length > 0)` block: map over `events.slice(0, 3)` instead of `events`; delete the `ev.external_url` "More info" Pressable from the inline card (keep the `ticket_url` one, now gated only on `ev.ticket_url`); after the mapped cards, add:

```tsx
        <Pressable
          onPress={() => navigation.navigate("VenueEvents", { venueId: venueId!, venueName })}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.eventLink}>See all events & specials →</Text>
        </Pressable>
```

- [ ] **Step 4: Move the menus hint**

Delete `<Text style={styles.subtitle}>Tap below to see Menus</Text>` (~line 430). Directly above the windows `FlatList` (`data={windowsForVenue}`), add:

```tsx
{windowsForVenue.length > 0 ? (
  <Text style={styles.subtitle}>Tap here to see menus</Text>
) : null}
```

If the FlatList is the scroll container itself (screen uses `ListHeaderComponent`), put the hint at the END of the existing `ListHeaderComponent` content instead — the guard only checks source order, but visually it must sit immediately above the first window card.

- [ ] **Step 5: Run tests to verify they pass**

`node --test test/venue-events-page.test.mjs` → 4/4 PASS. `npx tsc --noEmit` clean. `npm test` full suite green.

- [ ] **Step 6: Commit**

```bash
git add test/venue-events-page.test.mjs apps/mobile/src/screens/VenuePreviewScreen.tsx
git commit -m "feat(mobile): Venue Preview trims events to 3 with see-all link; menus hint moved to the tap targets"
```

---

### Task 5: Full verification + PR

- [ ] **Step 1: Full matrix** — from `apps/mobile`: `npx tsc --noEmit`; from repo root: `npm test` (expect prior count + 4 new, 0 fail, output pristine).
- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/venue-events-page
gh pr create --title "feat(mobile): per-venue Events & Specials page; More info stays in-app; menus hint at tap targets" --body "..."
```

Body summarizes: new VenueEventsScreen (recurring specials + upcoming), calendar/preview rewiring, push routing, menus copy; JS-only, OTA-able on 1.0.8; ends with the generated-with footer.

- [ ] **Step 3: Wait for CI green** (required checks `node` + `supabase-migrations`), then squash-merge.
- [ ] **Step 4: Rollout note** — no deploy: the change rides OTA per `docs/ota-runbook.md` once the 1.0.8 store build is live (preview channel + device verify first, then promote to branch `master`). Do NOT publish an OTA as part of this plan.
