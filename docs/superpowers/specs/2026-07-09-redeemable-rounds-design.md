# Redeemable Rounds — Design Spec

**Status:** Direction decided (2026-07-08); ready for implementation-plan.
**Concept artifact:** https://claude.ai/code/artifact/e6e1c315-3612-409a-9c2f-f564ccf8abcb

## Goal

Let a venue owner/manager choose **what** guests can redeem for completing the existing check-in loyalty round, and advertise that reward — on the public directory, in-app, and through the guest's check-in flow. Today the reward is a hardcoded "round" with no owner control and no advertising surface.

## Background — what already exists

The check-in loyalty spine is built (migration `20260610040000_pilot_checkin_spine.sql`):

- **`checkins`** — one row per (user, venue, service_date); method `code` or `gps_fallback`.
- **`round_redemptions`** — `(user_id, venue_id, checkins_consumed default 5, confirmed_with_code, created_at)`. Written only via service-role edge functions.
- **`venues`** pilot columns — `checkin_secret`, `staff_token`, `geofence_radius_m`.
- **Edge function `verify-checkin`** (`supabase/functions/verify-checkin/`) — verifies the check-in, stamps progress, and gates redemption. `logic.ts` defines `STAMPS_PER_ROUND = 5`, `stampsToNextRound()`, `canRedeem(stamps) = stamps >= 5`.
- **Mobile consumer flow (exists):** `CheckInScreen` (stamp card "3 of 5 — the house buys your next round", client `STAMPS_PER_ROUND = 5`) → `RoundRedemptionScreen` (staff-code-confirmed redeem).

**The gap this fills:** there is **no owner-facing setup UI**, **no advertising surface**, and **no data-enforced redemption limit**. The reward is a generic "round"; the guest screens have no configurable reward text to show.

## Decisions (locked)

| # | Decision |
|---|----------|
| **D1** | **One reward per venue.** A single active reward — no tiers. |
| **D2** | **Earn-it count stays fixed at 5, platform-wide.** NOT owner-editable. Leave `STAMPS_PER_ROUND` (client + `verify-checkin/logic.ts`) and `round_redemptions.checkins_consumed` default as-is. Owner chooses *what*, not *how many*. |
| **D3** | **Reward = presets only.** Owner picks from a fixed set list; no custom free text (deferred). |
| **D4** | **Advertise on the public directory (happitime.biz)** as well as in-app browse + the venue page. |
| **D5** | **Weekly redemption limit enforced in data.** "One reward per guest, per week" is rejected at the redemption path, not just displayed as fine print. |

## Reward preset registry (single source of truth)

A fixed, ordered list mapping a stable `preset key` → guest-facing label. This is the ONLY place labels live; every surface (owner console, directory badge, venue banner, mobile screens) renders from it.

```
house_draft    → "A house draft"
well_cocktail  → "A well cocktail"
five_off       → "$5 off the tab"
free_appetizer → "A free appetizer"
```

- **Web + directory:** add to `packages/shared-types` (or a small shared module both Next apps import).
- **Mobile:** mirror as a plain `.mjs` constant with a `node --test` **parity test** asserting the mobile list equals the shared list (mirrors the repo's existing `*.test.mjs` convention) so the two never drift.
- Adding/removing a preset later = one edit in each mirror + the DB CHECK constraint (below). Custom free-text rewards are explicitly out of scope (D3).

## Architecture — units

### Unit 1 — Data model: per-venue reward config

**Migration** adds two columns to `venues`:

- `reward_preset text` — nullable; `CHECK (reward_preset IN ('house_draft','well_cocktail','five_off','free_appetizer'))`.
- `reward_active boolean NOT NULL DEFAULT false` — the "advertise this reward" toggle.

An offer is **live** iff `reward_preset IS NOT NULL AND reward_active = true`.

**Grants / RLS (critical — mirrors the `user_profiles` column-grant trap from PR #106):**
- The owner console writes these as an org-member via the cookie-session (`authenticated`) client. Verify/`GRANT UPDATE (reward_preset, reward_active) ON public.venues TO authenticated` if `venues` uses column-level grants; otherwise the owner-update RLS policy is sufficient. **Check `has_column_privilege('authenticated','public.venues','reward_preset','UPDATE')` after applying.**
- Anon read: the directory reads published venues via the anon client. Confirm the new columns are exposed on whatever the directory selects (table or view). No sensitive data — safe to expose.

**Migration hygiene:** forward-only, zero-drift. **Apply via the repo's DB-deploy pipeline, NOT the Supabase MCP `apply_migration` tool** — the MCP stamps its own version and causes the exact history drift currently blocking `Supabase DB Deploy` (see the pending reconciliation). Commit the identical SQL file; run `get_advisors` after.

### Unit 2 — Weekly redemption cap (D5)

The redemption path (in `verify-checkin` or the dedicated redeem handler that inserts into `round_redemptions`) must reject a redemption when the user already redeemed at this venue within the last 7 days.

- **Pure logic** (testable, in `verify-checkin/logic.ts`): `canRedeemWeekly(lastRedeemedAt: Date | null, now: Date): boolean` → false when `lastRedeemedAt` is within 7×24h of `now`.
- **Handler:** before inserting a `round_redemptions` row, query the most recent redemption for `(user_id, venue_id)`; if `!canRedeemWeekly(...)`, return a typed error (`weekly_limit_reached`) the client renders as "You've already claimed this week — come back {date}."
- Keep the check in the service-role handler (authoritative). Optionally add a partial index on `round_redemptions (user_id, venue_id, created_at)` for the lookup.

### Unit 3 — Owner console: "Redeemable Reward" card

Add a card to the venue dashboard (`apps/web/src/components/venue/VenueDashboardShell.tsx`, rendered from `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx`).

- Controls: **preset picker** (chips from the registry), **"Advertise this reward" toggle** (`reward_active`), read-only display of the fixed **5 check-ins** and the enforced **weekly limit**, the venue's **staff redemption code** (existing `staff_token`-derived), optional non-enforced "house terms" display text (only if we want it — otherwise omit to avoid a free-text field creeping in).
- **Server Action** (`apps/web/src/actions/…`) updates `venues.reward_preset` / `reward_active` for a venue the caller manages (assert org membership), `revalidatePath`. Validate `reward_preset` against the registry server-side.
- Live "guest preview" mini-card renders from the registry so the owner sees the exact badge/stamp-card copy.

### Unit 4 — Advertising surfaces (D4)

Read `reward_preset` + `reward_active` (offer live) and render the registry label.

- **Directory listing badge** — `apps/directory/src/components/VenueCard.tsx` / `VenueCardClient.tsx`: a small "5 check-ins = {label}" badge on cards whose offer is live.
- **"Rewards" filter** — `apps/directory/src/components/FilterableVenueGrid.tsx`: a chip that filters to venues with a live offer.
- **Venue-page banner** — the venue detail page: "The next round's on the house — check in 5 times, get {label}." For a signed-in guest, optionally show progress ("3/5").
- All gated on offer-live; venues without a configured reward render exactly as today.

### Unit 5 — Consumer wiring (mobile, OTA-able)

The existing screens show the configured reward text instead of a generic "round."

- `verify-checkin` response (or the venue payload the app already fetches) includes the venue's `reward_preset`.
- `CheckInScreen` stamp-card caption and `RoundRedemptionScreen` render "{label}" from the mobile registry mirror. Falls back to the current generic copy when no preset is set.
- No change to the `5` count (D2). Pure-JS → OTA-able.

## Data flow

```
Owner console (Unit 3) --writes--> venues.reward_preset/reward_active (Unit 1)
                                          |
                    anon read            | authenticated read (verify-checkin)
        ┌──────────────────────────┬─────┘
        v                          v
  Directory badge/filter +    Mobile check-in/redeem screens (Unit 5)
  venue banner (Unit 4)             |
                                    v
                        Redeem → weekly-cap check (Unit 2) → round_redemptions
```

## Error handling

- Invalid `reward_preset` (not in registry) → Server Action rejects, owner sees an inline error; DB CHECK is the backstop.
- Redemption blocked by weekly cap → typed `weekly_limit_reached` with the next-eligible date; screen shows a friendly message, not a failure.
- Offer not live / no preset → every surface degrades to today's behavior (no badge, generic copy). Never a broken state.

## Testing

- **Unit 2 pure logic:** `canRedeemWeekly` — boundary cases (exactly 7 days, just under, null) in `verify-checkin`'s Deno test (`index.test.ts` / logic tests).
- **Registry parity:** `node --test` asserting mobile mirror == shared registry.
- **Server Action:** typecheck-clean; manual verify preset write + org-membership gate.
- **Advertising:** offer-live gating renders badge only when configured; verify anon read of the new columns.
- Repo gates: `npm run typecheck && npm run lint`, CI green on Node 20.

## Constraints & risks

- **Migration drift:** do NOT use MCP `apply_migration` (caused the current `Supabase DB Deploy` failure being reconciled). Use the committed-migration + db-deploy path; keep zero-drift.
- **Column-grant trap:** new user-writable `venues` columns may need an explicit `GRANT UPDATE (...) TO authenticated` — verify with `has_column_privilege`, exactly like the `user_profiles` socials fix.
- **Directory read surface:** confirm the new columns flow through whatever the directory selects (table vs. view) for anon.
- **`STAMPS_PER_ROUND` stays 5** in both `verify-checkin/logic.ts` and the mobile client — unchanged by design (D2).

## Out of scope / deferred

- Custom free-text rewards (D3 — presets only for now).
- Reward tiers / multiple simultaneous rewards (D1 — one per venue).
- Owner-configurable earn count or weekly window (D2/D5 — fixed).
- Redemption analytics / owner reporting on reward performance.

## Open items (confirm during planning)

- Keep the optional non-enforced "house terms" display line, or omit it to stay strictly presets? (Leaning omit.)
- Does the venue payload the mobile app already fetches include a place to add `reward_preset`, or does `verify-checkin` carry it? (Impl detail — pick the fewest round-trips.)
