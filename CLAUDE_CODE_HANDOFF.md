# Claude Code Handoff — Coaster Check-in Onboarding

Paste the block below into Claude Code from the repo root. The authoritative detail lives in three specs already in this repo; this is the kickoff + guardrails.

---

## PROMPT (copy from here)

You are implementing the "coaster check-in onboarding" for HappiTime. Work on a new branch. Do NOT deploy anything (no `supabase functions deploy`, no EAS build, no prod migration push) — leave that to me.

### Read first (authoritative specs, in this repo)
1. `COASTER_ONBOARDING_SPEC.md` — the product behavior + why the gate is "at a venue," not "came from a coaster."
2. `COASTER_ONBOARDING_TASKS.md` — the task-by-task breakdown (ON1–ON4) with the exact `nearest_published_venue` RPC SQL and real file paths. **Implement this.**
3. `OPTION_B_ATTRIBUTION_SPEC.md` — the attribution model this fits into (context).

Then read the integration points before writing anything: `apps/mobile/src/onboarding/state.ts`, `apps/mobile/src/screens/OnboardingScreen.tsx`, `apps/mobile/src/hooks/useOnboardingStatus.ts`, `apps/mobile/src/screens/onboarding/LocationPrimeScreen.tsx`, `apps/mobile/src/screens/CheckInScreen.tsx`, `apps/mobile/src/navigation/AppNavigator.tsx`, `apps/mobile/src/navigation/types.ts`.

### Scope — build exactly this, nothing more
- **ON2**: the `nearest_published_venue` Postgres RPC (new migration in `supabase/migrations/`). SQL is in the tasks doc — plain haversine, no PostGIS, `security definer`, granted to `authenticated`.
- **ON1**: insert a `"checkin_prime"` onboarding step after `"location"` and wire the post-signup geofence trigger.
- **ON3**: a small new `CheckInPrimeScreen` + a `fromOnboarding?: boolean` param on the existing `CheckIn` route. Reuse `CheckInScreen` as-is.
- **ON4**: a one-time AsyncStorage guard (`apps/mobile/src/lib/checkinPrimeShown.ts`).

### Hard constraints (do not violate)
- **No MMP / no deferred-deep-link SDK** (no Branch, AppsFlyer, Adjust). The gate is GPS-at-first-run, not install attribution.
- **Do NOT bump `ONBOARDING_VERSION`** — that re-onboards existing users. Just add the step to the array.
- **Location is foreground-only**, requested once at the check-in moment; if permission isn't already granted from the `"location"` step, skip the prime (do not re-prompt).
- **Do NOT modify** `verify-checkin`, `useCheckin`, the daily-code logic, or the Rounds/`round_redemptions` flow. ON3 only navigates into the existing screen.
- Match radius for routing = 250 m (`p_max_m`); the strict per-venue fence stays enforced by `verify-checkin`.
- The universal coaster link (`https://happitime.biz/app?utm_source=coaster&utm_medium=qr`) and the QR art are already done — don't touch them.

### Workflow
1. Restate your understanding + a short plan before coding.
2. Build in the tasks-doc order: ON2 → ON4 → ON1 → ON3.
3. Match existing conventions (the `(supabase as any)` calls, theme tokens from `theme/colors`/`theme/spacing`, AsyncStorage key style `happitime:onboarding:...`).

### Verify before you call it done
- Run the new migration against a local/branch DB and prove the RPC: one `select * from nearest_published_venue(<coords inside a published venue>, 250);` returns that venue; one residential coordinate returns 0 rows; confirm `authenticated`-only execute.
- Typecheck/lint the mobile app and run any existing check-in/onboarding tests.
- Manually trace (or test) both paths: new user inside a venue geofence → prime → CheckIn; new user elsewhere → normal app, no prompt; prime never fires twice.
- Summarize: files changed, the migration name, and anything I need to deploy.

### Definition of done
New user at a published venue is routed into that venue's check-in ("ask your server for today's code"); new user anywhere else gets the normal app; fires at most once per install; Skip always available; no MMP; `verify-checkin`/Rounds untouched.

## (end prompt)

---

**Note for me (not Claude Code):** background-location decision in `PILOT_BUILD_SPEC.md` §7 should be closed before this ships; ON5 (Android Play install-referrer labeling) is a separate optional task, deliberately excluded above.
