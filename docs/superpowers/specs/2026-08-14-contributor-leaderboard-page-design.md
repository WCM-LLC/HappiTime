# Contributor Leaderboard Page — Design

**Date:** 2026-08-14
**Status:** Awaiting review
**Scope:** Piece 3 of 3. The public page and its read path.
**Predecessors:** `2026-08-13-contribution-attribution-design.md` (piece 1, shipped in #176) and `2026-08-14-contribution-scoring-design.md` (piece 2, in #181)

## Why

Pieces 1 and 2 record who contributed and what it is worth. Nobody can see any
of it. This publishes the ranking.

## Grounding, measured 2026-08-14

| Fact | Value | Consequence |
|---|---|---|
| Super users | 4 | The entire eligible population today |
| …with a handle | 4 | Handle-only excludes nobody |
| `venue_toastmakers` rows | **0** | The badge renders for no one yet |
| Published cities | 10 | But see below — they are one metro |
| Attributed + published content | **0** | **The board ships empty** |

The board will be empty on the day it ships. Nothing is both attributed and
published: piece 1 shipped hours ago with no backfill, and piece 2's
`published_at` only starts recording now. This is expected and was chosen —
"count from launch" — but it is the reason the toggle exists and the reason the
empty state gets real design attention rather than a bare table.

### The ten cities are one metro

| City | Published venues |
|---|---|
| Kansas City | 174 |
| Lee's Summit | 6 |
| North Kansas City | 3 |
| Leawood / Independence / Blue Springs / Olathe | 2 each |
| Westwood / Parkville / Gladstone | 1 each |

Ranking per city would produce one real board and nine near-empty ones, split a
contributor's score across the metro, and make "#1 in Westwood" — a city with a
single venue — an honour nobody values. So the page renders **one board**, and
city stays in the data for when a second real metro exists.

## Decisions

Made with Juan on 2026-08-14.

| Decision | Choice | Rationale |
|---|---|---|
| Surface | Public directory site, `/leaderboard` | Anonymous visitors, no login. Maximum reach, and the strongest argument for handles over names. |
| Grouping | **One board now**; city carried in the data | The ten cities are one metro. Scores stay whole and #1 means something. |
| Cutoff | **Top 10**, score > 0 | Short and readable. Everyone qualifies today. |
| Identity | **Handle only**; no handle → not listed | Setting a handle is the de facto opt-in to public ranking. All four super users have one. |
| Toastmaker badge | **Built now** | Asked for explicitly. Renders for nobody until someone is ratified. |
| Toggle | Server-side `LEADERBOARD_ENABLED` | Off means `notFound()` — a disabled board is not discoverable or indexable. |
| Read path | `SECURITY DEFINER` RPC granted to `anon` | Keeps `contributor_scores` revoked and keeps the service-role key off a public page. |

## Design

### 1. The RPC

`public.contributor_leaderboard(p_limit int default 10)`, `SECURITY DEFINER`,
granted to `anon` and `authenticated`.

It aggregates `contributor_scores` per user across cities, joins
`user_profiles` for the handle, and joins `venue_toastmakers` for the badge.

Returns one row per ranked contributor:

```
rank          int      dense_rank over score desc; ties share a rank
handle        text     never null — unhandled users are filtered out
score         bigint   the weighted total
menus         bigint
windows       bigint
events        bigint
is_toastmaker boolean
primary_city  text     where they earned the most, for display and for later sectioning
```

**It never returns `user_id`.** The function is the security boundary, and a
boundary that hands out identifiers is not one. A handle is already public by
the user's own choice; a user id is a join key into everything else.

Filters: `handle is not null`, `score > 0`, `rank <= p_limit`.

**On sectioning later.** An earlier draft claimed switching to per-city
sections would need no RPC work. That was optimistic. Because the function
aggregates across cities to produce one score per person, per-city sections
need a `p_city text default null` filter parameter — a small change, not a
rewrite. `primary_city` is returned today so the page can already display it.

### 2. The badge

`is_toastmaker` is true when the user is the ratified Toastmaker at **any**
venue for the current quarter. The quarter is computed in SQL as
`to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q')`, matching the
`YYYY-Q#` format `fetchToastmakerHandle` already writes and reads.

It will be false for everyone until someone is ratified. That is accepted.

### 3. The page

`apps/directory/src/app/leaderboard/page.tsx` — a server component with
`export const revalidate = 900`, matching the venue page's ISR cadence.

**Read via the anon client**, not `getServiceClient()`. The RPC grant makes
this possible, so no service-role key touches a public, cacheable page. This is
deliberately better than `fetchToastmakerHandle`, which needs the service-role
client only because `venue_toastmakers` is not granted to `anon`. Here the
database itself is the boundary: `anon` can call one function that returns
publishable columns and nothing else.

Rendering: rank, handle as `@handle`, score, a compact breakdown
(`3 menus · 2 events`), the Toastmaker badge when true, and `primary_city`.

### 4. The toggle

`process.env.LEADERBOARD_ENABLED === 'true'` gates the route. Anything else
calls `notFound()`.

Deliberately **not** `NEXT_PUBLIC_` — the page is server-rendered, so the flag
has no reason to reach the client, and a public build should not advertise an
unlaunched feature. This follows the `NEXT_PUBLIC_COMING_SOON` precedent in
`apps/directory/src/app/page.tsx` while keeping the value server-side.

The nav link is gated by the same flag, so an enabled board is reachable and a
disabled one leaves no dangling link.

### 5. The empty state

The board ships empty, so this is a real screen and not an afterthought.

Rather than an empty table with headers, the page explains that contributions
are still being published and that rankings appear as super users add Happy
Hour menus. No fake rows, no placeholder names.

Given it ships empty, `LEADERBOARD_ENABLED` should stay **off** until at least
one contributor ranks.

## Non-goals

- **Per-city sections.** The data supports it; the metro does not warrant it yet.
- **Opening the board to regular users.** Piece 2's view already admits the
  `user` tier, so they appear the day such contributions exist.
- **All-time totals alongside the 90-day ranking.** Rejected in piece 2.
- **Ranking Toastmakers.** Toastmaker status is a badge, never a ranking input.
  `toastmaker_scores` is not read by this work and stays revoked.
- **Restructuring `apps/android`** onto the iOS pattern — its own design round.

## Testing

- The RPC returns no `user_id` column — asserted against the migration SQL.
- `contributor_scores` remains revoked from `anon` and `authenticated`; only the
  function is granted.
- Handle-less contributors and zero-score contributors are excluded.
- Ties share a rank.
- The page calls `notFound()` when the flag is not exactly `'true'`.
- The page uses the anon client, not `getServiceClient()` — a source-pinned
  test, because reaching for the service-role client is the easy mistake and it
  would silently undo the boundary.
- Query shape validated read-only against production, as piece 2's was.
- Full suite green. Baseline at time of writing: **579 tests, 0 failures**.

## Open questions

1. **Where does the nav link live?** `apps/directory/src/app/layout.tsx` renders
   the nav and already branches on `NEXT_PUBLIC_COMING_SOON`. Adding a
   server-side flag there is straightforward, but the layout is shared with the
   coming-soon splash, so placement needs a look during implementation.
2. **Whether to show the score at all**, or only the ranking and breakdown. A
   visible number invites "why am I 3 points behind" questions that the 90-day
   rolling window makes hard to answer precisely. Showing it is the default.
