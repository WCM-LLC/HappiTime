# Pilot Phase 2 — Venue Deep-Link Routing & Attribution Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a tapped `https://happitime.biz/v/{slug}` open the installed app directly to the venue (Universal-Link parity with `/i/*`), and verify the scan → install → first-check-in attribution loop end-to-end once Phase 1 ships.

**Architecture:** Most of this already exists. `useVenueDeepLink` already routes `happitime://venue/{slug}` and `https://happitime.biz/v/{slug}` → `VenuePreview` via manual `expo-linking` listeners (the app does NOT use `NavigationContainer` `linking`). The QR bridge `apps/directory/src/app/v/[slug]/page.tsx` already fires `track-visit`. Phase 2 adds `/v/*` to the Apple App Site Association + native intent filters so `https://` venue links open the app without bouncing through Safari, then verifies the attribution chain.

**Tech Stack:** Next.js (apps/directory static `public/`), Expo `app.json` (native config → needs a build), the existing `useVenueDeepLink` hook + `verify-checkin` (Phase 1).

**Spec:** `PILOT_BUILD_SPEC.md` §5. **Prereq:** Phase 1 (`feat/pilot-checkin-spine`, PR #77) merged + `verify-checkin` deployed (Task 3 verifies against it).

> **Delivery note:** the `app.json` changes are NATIVE (associatedDomains/intentFilters) — they take effect only in a NEW build, and ride the next store build (like the nonce). The AASA file change is a Vercel deploy. Do NOT OTA app.json.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/directory/public/.well-known/apple-app-site-association` | add `/v/*` to the `components`/`paths` so iOS opens venue links in-app |
| `apps/mobile/app.json` | Android `intentFilters` add a `/v` pathPrefix entry (iOS `applinks:happitime.biz` already covers all paths once AASA lists them) |
| `test/aasa-venue-paths.test.mjs` | assert the AASA serves `/v/*` + `/i/*` and stays valid JSON |

---

### Task 1: Add `/v/*` to the Apple App Site Association + Android intent filter

**Files:**
- Modify: `apps/directory/public/.well-known/apple-app-site-association`
- Modify: `apps/mobile/app.json`
- Test: `test/aasa-venue-paths.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/aasa-venue-paths.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const aasa = JSON.parse(
  readFileSync(new URL("../apps/directory/public/.well-known/apple-app-site-association", import.meta.url), "utf8")
);
const detail = aasa.applinks.details[0];

test("AASA covers both itinerary and venue paths", () => {
  const comps = (detail.components ?? []).map((c) => c["/"]);
  assert.ok(comps.includes("/i/*"), "keeps /i/*");
  assert.ok(comps.includes("/v/*"), "adds /v/*");
  // legacy paths array kept in sync for older iOS
  assert.ok(detail.paths.includes("/i/*") && detail.paths.includes("/v/*"));
});
```

- [ ] **Step 2: Run it — Expected: FAIL** (`/v/*` not present)

Run: `node --test test/aasa-venue-paths.test.mjs`

- [ ] **Step 3: Add `/v/*` to the AASA**

`apps/directory/public/.well-known/apple-app-site-association` — extend the single detail entry:
```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["787CJ7NZ7H.com.jwill7486.happitime.mobile"],
        "appID": "787CJ7NZ7H.com.jwill7486.happitime.mobile",
        "components": [
          { "/": "/i/*", "comment": "Shared itinerary links open in the app" },
          { "/": "/v/*", "comment": "Venue QR / share links open in the app" }
        ],
        "paths": ["/i/*", "/v/*"]
      }
    ]
  }
}
```

- [ ] **Step 4: Add the Android intent filter path** — in `apps/mobile/app.json`, the existing `android.intentFilters[0].data` array currently has `{ "scheme": "https", "host": "happitime.biz", "pathPrefix": "/i" }`. Add a sibling: `{ "scheme": "https", "host": "happitime.biz", "pathPrefix": "/v" }`. (iOS needs no app.json change — `applinks:happitime.biz` already grants all AASA-listed paths.)

- [ ] **Step 5: Run the test — Expected: PASS.** Also `cd apps/directory && npx tsc --noEmit` (clean — JSON only, but confirm build isn't broken).

- [ ] **Step 6: Commit**

```bash
git add apps/directory/public/.well-known/apple-app-site-association apps/mobile/app.json test/aasa-venue-paths.test.mjs
git commit -m "feat(pilot): venue Universal Links — add /v/* to AASA + Android intent filter"
```

> **Note:** `useVenueDeepLink` already parses `https://happitime.biz/v/{slug}` (and `happitime://venue/{slug}`), so no mobile routing code changes — once a build carries this AASA-backed entitlement, the OS hands `/v/{slug}` taps straight to the existing handler.

---

### Task 2: Verify AASA serves correctly post-deploy (manual, gated on Vercel deploy)

**Files:** none (verification task).

- [ ] **Step 1:** After the directory deploys, confirm the file serves with both paths:
```bash
curl -sS https://happitime.biz/.well-known/apple-app-site-association | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['applinks']['details'][0]['paths'])"
```
Expected: `['/i/*', '/v/*']`, HTTP 200, `content-type: application/json` (the `next.config.ts` header rule already forces JSON).

---

### Task 3: Attribution-loop verification (gated on Phase 1 deployed)

**Files:** none (verification + targeted gap-fill only).

**Context:** The loop is: scan QR (`/v/{slug}?src=qr`) → `track-visit` fires (`source='qr'`, anonymous) → user installs/opens → `useVenueDeepLink` opens `VenuePreview` → user taps **Check In** → `verify-checkin` writes a `checkins` row + a `venue_attribution_events` row (`source='app_checkin'`, with `user_id`) and returns `is_first_visit`. That authed event is the "birth certificate" closing scan → install → first check-in.

- [ ] **Step 1:** Confirm `verify-checkin` (Phase 1, Task 3) writes the `venue_attribution_events` row with `source='app_checkin'` and `user_id` set. Read `supabase/functions/verify-checkin/index.ts` (rule 6) and confirm the columns match what `track-visit` writes (so qr + app_checkin events join cleanly per venue/user).
- [ ] **Step 2:** Confirm `useVenueDeepLink` cold-start capture (`takePendingVenueLink`) routes a guest who installs-then-opens into `VenuePreview` so the Check-In entry point is reachable on first run. (Read `useVenueLinkCapture` + `useVenueDeepLink`.)
- [ ] **Step 3:** If either is missing/mismatched, file the specific gap as its own task — do NOT rebuild the existing deep-link infrastructure. Otherwise mark Phase 2 done; the loop is wired.

---

## Phase 2 Acceptance
- [ ] `happitime.biz/.well-known/apple-app-site-association` serves `/i/*` AND `/v/*` (200, JSON).
- [ ] A new build with the updated entitlement opens a tapped `happitime.biz/v/{slug}` directly in the app at `VenuePreview` (device test, with the next store build).
- [ ] A scan → install → in-app Check-In produces a `venue_attribution_events` `app_checkin` row joined to the prior `qr` event for that venue (verified once `verify-checkin` is deployed).

## Self-Review
- **Spec §5 coverage:** "linking config" → already satisfied by `useVenueDeepLink` (noted, not rebuilt); the incremental Universal-Link entitlement for `/v/*` → Task 1; "QR landing keeps firing track-visit + first authed event closes the loop" → Task 3. No placeholders. Type/name consistency: references existing `useVenueDeepLink`, `track-visit`, `verify-checkin` only.
- **Scope:** intentionally tiny — this phase is mostly verification + one entitlement add. Rides the next native build.
