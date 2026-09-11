# Coaster Onboarding — Developer Task Breakdown (ON1–ON4)

**Companion to:** `COASTER_ONBOARDING_SPEC.md`. This is the implementation checklist — real files, contracts, and the one RPC. No app code is written here; signatures and the SQL migration are the contracts to build against.

**Behavior being built:** a brand-new user who finishes signup **while physically inside a published venue's geofence** is routed into that venue's check-in ("ask your server for today's code"). Everyone else proceeds to the normal app. Fires at most once per install. No MMP.

**Grounding (verified against the repo):**
- Route `CheckIn` already exists in `apps/mobile/src/navigation/AppNavigator.tsx` with params `{ venueId, venueName, lat, lng }` (type in `navigation/types.ts`). The screen handles code entry → `verify-checkin` → `RoundRedemptionScreen`.
- Onboarding is a versioned machine: `apps/mobile/src/onboarding/state.ts` (`ONBOARDING_STEPS = ["welcome","location",…,"complete"]`, `ONBOARDING_VERSION = 1`, `nextOnboardingStep`). Rendered by `screens/OnboardingScreen.tsx`; step screens live in `screens/onboarding/` (incl. `LocationPrimeScreen.tsx`). Completion tracked in `hooks/useOnboardingStatus.ts` via AsyncStorage key `happitime:onboarding:v{VERSION}:{userId}` **and** `user_preferences.onboarding_completed_at/_step`.
- Location permission is already requested in onboarding (`LocationPrimeScreen`); `completeOnboarding` persists `location_enabled` + `location_permission_status`.
- `PostSignupCapture.tsx` runs after signup (handle claim) with an `onComplete` callback.
- `venues` has `lat`, `lng` (double precision), `geofence_radius_m` (int, default 100), `status`, `slug`, `name`. **No PostGIS / earthdistance** → haversine in SQL.

---

## ON2 — `nearest_published_venue` RPC  *(build first; ON1/ON3 depend on it)*

**New migration:** `supabase/migrations/<ts>_nearest_published_venue.sql`
**Contract:** given a point, return the closest *published* venue within a search radius, with distance and the venue's own geofence radius so the client can both label ("You're at X") and let `verify-checkin` enforce the strict per-venue fence at actual check-in.

```sql
-- Plain haversine (no PostGIS). Bounding-box prefilter keeps it index-friendly.
create or replace function public.nearest_published_venue(
  p_lat double precision,
  p_lng double precision,
  p_max_m integer default 250
)
returns table (
  venue_id uuid,
  slug text,
  name text,
  lat double precision,
  lng double precision,
  geofence_radius_m integer,
  distance_m double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with bounded as (
    select v.id, v.slug, v.name, v.lat, v.lng, v.geofence_radius_m,
           2 * 6371000 * asin(sqrt(
             power(sin(radians(v.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(v.lat)) *
             power(sin(radians(v.lng - p_lng) / 2), 2)
           )) as distance_m
    from public.venues v
    where v.status = 'published'
      and v.lat is not null and v.lng is not null
      -- ~ p_max_m box prefilter (1 deg lat ≈ 111_320 m); generous, refined by haversine below
      and v.lat between p_lat - (p_max_m / 111320.0) and p_lat + (p_max_m / 111320.0)
      and v.lng between p_lng - (p_max_m / (111320.0 * cos(radians(p_lat))))
                    and p_lng + (p_max_m / (111320.0 * cos(radians(p_lat))))
  )
  select id, slug, name, lat, lng, geofence_radius_m, distance_m
  from bounded
  where distance_m <= p_max_m
  order by distance_m asc
  limit 1;
$$;

revoke all on function public.nearest_published_venue(double precision, double precision, integer) from public;
grant execute on function public.nearest_published_venue(double precision, double precision, integer) to authenticated;
```

**Notes**
- `p_max_m` is the *search* radius (suggest 250 m so GPS jitter near the door still matches). `verify-checkin` still enforces the strict per-venue `geofence_radius_m` at the real check-in — this RPC only decides routing.
- Optional index if `venues` grows: `create index on venues (lat, lng) where status = 'published';`
- **Acceptance:** returns a venue when called with coords inside a published venue's box; returns 0 rows from a random residential coordinate; only `authenticated` can execute.

---

## ON1 — Post-signup geofence trigger  *(the gate)*

**Files**
- `apps/mobile/src/onboarding/state.ts` — insert a `"checkin_prime"` step **after** `"location"`, before `"complete"`, in `ONBOARDING_STEPS`. **Do NOT bump `ONBOARDING_VERSION`** (bumping re-runs onboarding for everyone; a new step only affects users still mid-flow, which is what we want).
- `apps/mobile/src/screens/OnboardingScreen.tsx` — render the new step (ON3 screen) when `step === "checkin_prime"`.
- `apps/mobile/src/onboarding/state.ts` `nextOnboardingStep` — ensure `location → checkin_prime → complete` ordering.

**Logic (in the new step's controller):**
1. Only run if first-run (`useOnboardingStatus().hasCompletedOnboarding === false`) and the one-time flag (ON4) is unset.
2. If location permission was granted in the `"location"` step, call `Location.getCurrentPositionAsync()` once (foreground). If not granted → skip straight to `complete` (don't re-prompt; couch users fall here too).
3. `supabase.rpc("nearest_published_venue", { p_lat, p_lng, p_max_m: 250 })`.
4. Match → advance to ON3 check-in prime with the venue. No match → mark flag (ON4) and advance to `complete`.

**Acceptance:** signing up at a venue advances into ON3; signing up anywhere else lands on the normal app with no check-in prompt.

---

## ON3 — Check-in onboarding entry (reuses `CheckIn`, no rebuild)

**Files**
- `apps/mobile/src/screens/onboarding/CheckInPrimeScreen.tsx` *(new, small)* — a single intro card: "You're at **{venue}** 🍻 — ask your server for today's HappiTime code," a **Check in** button, and a **Skip for now** link. "Check in" calls `navigation.navigate("CheckIn", { venueId, venueName, lat, lng, fromOnboarding: true })`; "Skip" sets the ON4 flag and completes onboarding.
- `apps/mobile/src/navigation/types.ts` — add optional `fromOnboarding?: boolean` to the `CheckIn` param type.
- `apps/mobile/src/screens/CheckInScreen.tsx` — when `route.params.fromOnboarding`, (a) show a "Skip / I'll do this later" affordance that returns to the tab root, and (b) optionally swap the header copy to the onboarding framing. **No logic change** to `useCheckin`/`verify-checkin` — the existing code path (code + GPS + stamp + `is_first_visit`) is reused verbatim; the 5th stamp still routes to `RoundRedemptionScreen`.

**Acceptance:** from the prime card, "Check in" lands on the working check-in screen pre-bound to the venue; "Skip" exits cleanly and never re-prompts.

---

## ON4 — One-time guard

**Files**
- `apps/mobile/src/lib/checkinPrimeShown.ts` *(new, ~AsyncStorage helper)* mirroring the existing onboarding storage pattern:
  - key: `happitime:onboarding:checkin_prime:v1:{userId}`
  - `hasShownCheckinPrime(userId): Promise<boolean>` / `markCheckinPrimeShown(userId): Promise<void>`
- Set the flag the moment ON1 resolves (match *or* no-match) and on ON3 "Skip" / successful check-in. Gate ON1 on it.

**Acceptance:** the prime never appears twice on the same install, regardless of how the first run ended.

---

## Build order & definition of done

1. **ON2** migration → verify with two `select * from nearest_published_venue(...)` calls (one inside a venue, one residential).
2. **ON4** storage helper (tiny, unblocks the gate).
3. **ON1** step insertion + trigger logic.
4. **ON3** prime screen + `fromOnboarding` param.

**Done when:**
- New user at a published venue → check-in prime → working check-in.
- New user not at a venue → normal app, no prompt.
- Fires at most once per install; "Skip" always available; location is foreground-only and never re-prompted.
- No new dependency, no MMP, no change to `verify-checkin` or the Rounds logic.

## Out of scope / explicitly deferred
- **ON5 (Android Play install-referrer origin labeling)** — separate, optional data-quality task; not required for the gate (see spec §4).
- Resolve the `PILOT_BUILD_SPEC.md` §7 background-location decision before shipping; this flow assumes **foreground-only**.
- No change to the universal coaster link or the per-venue `/v/{slug}` path.
