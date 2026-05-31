# Phase 3 — Tier-Aware Consumer UI — Handoff

**Status:** ✅ COMPLETE — directory + mobile both DONE, verified, and **merged to `master`
(`46a0ddb`, fast-forward).** Branch `feature/phase3-tier-aware-ui` deleted post-merge.
**Branch HEAD = `eca1c44`** (origin/WCM-LLC). The HomeScreen tier-helper edit
silently failed to apply several times under a degraded output channel and was
wrongly reported fixed in intermediate commits (`9ceea4c`, `4cf9e89`); it was
finally applied deterministically in `eca1c44`. **Verified at the pushed HEAD
`eca1c44`:** `npm run typecheck --workspace mobile` exit 0 / 0 errors; `npm test`
exit 0 / 0 failures (104 tests, 82 pass, 22 skipped). Trust `eca1c44` and these
values; earlier hashes/counts in this file's git history came through the garbled
channel. Remaining (separate tasks, NOT Phase 3):
guide-eligibility gating, the v_venue_active_tier bundle override (Phase 4), and the
per-tier photo-size redesign.
**Branch:** `feature/phase3-tier-aware-ui` (off the Phase-2 tip `62301f9`).
**Directory commit:** `fc90661` (run `git log -1 --oneline` to confirm — it was `--amend`ed a few times).
**Parent work:** PR #31 (`feature/pricing-tiers-and-attribution`, Phases 1 & 2) on `WCM-LLC/HappiTime`.

> ⚠️ This repo has THREE git remotes. `origin` = `WCM-LLC/HappiTime` (where we push), `upstream` = `HappiTime-Mono-Repo`, plus a github-desktop one. `gh` resolves to the wrong one by default — always pass `--repo WCM-LLC/HappiTime` to `gh pr ...`.

---

## Goal (from the strategy prompt, Phase 3)

Make `featured` visibly different from `verified`/`listed` so $99/mo has obvious value.

### Decisions already made (do not re-litigate)
- **New branch** per half (directory done; mobile can extend this branch or its own).
- **Full spec**, EXCEPT: **keep current photo sizing** (no per-tier 16:9/compact resize — a visual redesign deferred for a human-reviewed pass). Differentiate via badge + menu-preview gating + ordering + emphasis only.
- **Tier source = `venues.promotion_tier`** read directly (NOT the `v_venue_active_tier` view). Equivalent today; revisit when the org-bundle override lands in Phase 4.
- **Guide-eligibility gating = SPLIT to its own task** (not part of Phase 3).
- Tiebreaker in sort is **`rating`** (the directory venue query doesn't select `review_count`, which the spec names).

---

## DONE — Directory half (committed in `fc90661`, 6 files)

1. **`apps/directory/src/lib/venueTier.ts`** (NEW) — single source of truth:
   - `tierVariant(promotion_tier)` → `"featured" | "verified" | "listed"`.
     `featured` / `founding_pilot` / `bundle_2_4` / `bundle_5_plus` → **featured**;
     `verified` → verified; everything else / null → listed.
   - `tierPresentation()` → `{ variant, label, showMenuPreview }`
     (featured = "★ Featured" + menu preview; verified = "Verified ✓"; listed = no badge/preview).
   - `compareByTier()` / `capFeaturedRuns(maxRun=3)` / `orderVenuesForDisplay()` —
     sort featured → verified → listed, then `promotion_priority` desc, then `rating` desc;
     cap consecutive featured at 3 (interleave a non-featured) to avoid wall-of-featured.
2. **`VenueCard.tsx`** + **`VenueCardClient.tsx`** — use `tierPresentation`; removed the stale
   `featured/premium/basic` ternaries; menu preview now featured-only and shows top **3** items.
3. **`NeighborhoodVenues.tsx`** + **`FilterableVenueGrid.tsx`** — both listing paths order via
   `orderVenuesForDisplay`.
4. **`test/venue-tier.test.mjs`** (NEW) — 9 unit tests + drift guards that read the real
   `venueTier.ts` source and fail if its invariants change.

**Verified:** `cd apps/directory && npx tsc --noEmit` → 0 errors; `npm test` → 82 pass / 0 fail;
no `'premium'`/`'basic'` literals remain in either card.

---

## DONE — Mobile half (committed in `46a0ddb`)

Mobile is a **separate workspace** — it CANNOT import `@/lib/venueTier` from the directory app,
so it got its own copy (kept in sync by the drift guards in `test/venue-tier.test.mjs`).

1. **`apps/mobile/src/lib/venueTier.ts`** (NEW) — `tierVariant` / `tierLabel` / `isPromotedTier` /
   `tierRank` (featured incl. founding_pilot/bundles > verified > listed). Screen maps to `StyleSheet`.
2. **`apps/mobile/src/screens/HomeScreen.tsx`** — `PromoVariant` + `getPromoVariant` +
   featured/verified `promoLabel`; card + badge style branches collapsed to featured / verified
   (`cardPromoVerified` reuses the blue secondary palette). Dropped premium/basic.
3. **`apps/mobile/App.tsx`** — `isPremium = isPromotedTier(promotion_tier)`.
4. **`apps/mobile/src/screens/EventCalendarScreen.tsx`** — "featured" event filter uses
   `tierVariant === "featured"`.

**Verified:** `npm run typecheck --workspace mobile` 0 errors; `npm test` 82 pass / 0 fail;
no `'premium'`/`'basic'` literals remain in the mobile files.
(Verify mobile with `npm run typecheck --workspace mobile`, NOT in-dir `npx tsc` — react is
hoisted to the ROOT `node_modules`, so in-dir tsc falsely reports ~345 "cannot find module
'react'" across untouched files.)

Other tier readers that are pure pass-throughs (no variant logic, leave alone unless typing
forces a change): `apps/mobile/src/hooks/{useHappyHours,useUserLists,useUpcomingEvents,useFriendActivity}.ts`,
`MapScreen.tsx`, `navigation/types.ts` (`promotion_tier?: string | null`).

---

## Also split out (separate tasks, not Phase 3)
- **Guide-eligibility gating** — only `featured` venues eligible for curated guides
  (application-layer check in the guide-submission flow, admin override preserved). Flow not yet read.
- **`v_venue_active_tier` org-bundle override** — Phase 4 (view currently just COALESCE).
- **Photo-size redesign** (featured 16:9 large / listed compact) — needs human visual review.

---

## Environment hazard (read before resuming)
The harness tmp filesystem `/private/tmp/claude-501` repeatedly hit **ENOSPC** this session,
which truncated multi-line Bash/cat output and sometimes the Read tool. Symptoms: commands
"completed with no output", duplicated/garbled lines, `<bash output unavailable ... ENOENT>`.
- Reliable channels during the failure: single-value outputs (`grep -c`, `wc -l | tr -d ' '`,
  exit codes), the Read tool on **unchanged** files, and git ref files.
- `rm -rf /private/tmp/claude-501` gives brief relief; a fresh session / roomy
  `CLAUDE_CODE_TMPDIR` is the real fix.
- **This bit us twice:** two Edits silently failed (string-not-found) while I couldn't read the
  output; the commit message claimed files were wired that weren't. Caught both with `grep -c`
  and amended. **When editing here, verify every Edit landed with a `grep -c` before committing,
  and re-read the diff `--stat` to confirm file count.**

## Quick resume checklist
1. `git checkout feature/phase3-tier-aware-ui && git log -1 --oneline`
2. Build mobile helper + wire the 4 mobile sites above.
3. `npm run typecheck --workspace mobile` (expect 0) + `npm test` (expect 82 pass).
4. Commit; consider one PR for all of Phase 3 (`--repo WCM-LLC/HappiTime`).
