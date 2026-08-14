# Contributor Leaderboard Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the contributor ranking at `/leaderboard` on the public directory, behind a toggle, without unlocking the scoring data.

**Architecture:** A `SECURITY DEFINER` RPC granted to `anon` is the only reader of `contributor_scores`, which stays revoked. The page calls it with the ordinary anon client — no service-role key on a public, cacheable route — and renders one board with ISR at 900s.

**Tech Stack:** Supabase Postgres, Next.js 15 App Router (`apps/directory`), `node --test` with `.mjs` tests that pin source and SQL by reading them.

**Spec:** `docs/superpowers/specs/2026-08-14-contributor-leaderboard-page-design.md`

## Global Constraints

- **Schema changes go through migrations only.** Never edit an applied migration.
- **`contributor_scores` stays revoked** from `anon` and `authenticated`. Only the new function reads it.
- **The RPC never returns `user_id`.** A handle is public by the user's choice; a user id is a join key into everything else.
- **Handle-only:** contributors without a handle are not listed.
- **Top 10, score > 0.**
- **One board.** City is returned for display and for later sectioning, not used to split the ranking.
- **Toggle is `LEADERBOARD_ENABLED`, server-side, not `NEXT_PUBLIC_`.** Anything other than exactly `'true'` means `notFound()`.
- **Ship it off.** The board is empty until a super user's contribution is published; do not enable the flag as part of this work.
- Tests: `npm test`. Baseline at time of writing: **559 tests, 0 failures, 23 skipped**.
- CI must be green. Ask before merging.

## Dependency on piece 2

This plan reads `contributor_scores`, created in **#181** (piece 2), which is **not merged**. Task 1's migration will fail on any branch that does not contain it. Branch this work from a base that includes #181, or merge #181 first.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260814140000_contributor_leaderboard_rpc.sql` | The function, its grant, and the docstring explaining why it exists |
| `apps/directory/src/app/leaderboard/page.tsx` | Toggle, fetch, render, empty state |
| `apps/directory/src/components/SiteNav.tsx` | The nav link, gated by the same flag |
| `apps/directory/.env.example` | Documents the flag |
| `test/contributor-leaderboard-rpc.test.mjs` | Pins the SQL contract |
| `test/contributor-leaderboard-page.test.mjs` | Pins the toggle, the anon-client choice, the empty state |

---

### Task 1: The RPC

**Files:**
- Create: `supabase/migrations/20260814140000_contributor_leaderboard_rpc.sql`
- Test: `test/contributor-leaderboard-rpc.test.mjs`

**Interfaces:**
- Consumes: `public.contributor_scores` (from #181), `public.user_profiles`, `public.venue_toastmakers`.
- Produces: `public.contributor_leaderboard(p_limit int)` returning
  `rank int, handle text, score bigint, menus bigint, windows bigint, events bigint, is_toastmaker boolean, primary_city text`.

- [ ] **Step 1: Write the failing test**

Create `test/contributor-leaderboard-rpc.test.mjs`:

```javascript
// test/contributor-leaderboard-rpc.test.mjs
//
// The public read path. contributor_scores exposes per-user activity across
// venues and is revoked from anon and authenticated for the same reason
// toastmaker_scores was in 20260811173852. This function is its only reader,
// and it is the security boundary — so what it returns IS the public surface.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260814140000_contributor_leaderboard_rpc.sql"),
  "utf8",
);

test("the function never returns user_id", () => {
  // A handle is public because the user chose one. A user id is a join key
  // into every other table. The boundary must not hand one out.
  const returns = sql.slice(sql.indexOf("returns table"), sql.indexOf("language sql"));
  assert.doesNotMatch(returns, /\buser_id\b/, "user_id must not be in the return signature");
  assert.match(returns, /handle text/);
});

test("it is security definer and granted to anon", () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /grant execute on function public\.contributor_leaderboard/i);
  assert.match(sql, /to anon/);
});

test("it does not re-grant the scoring view", () => {
  // The whole point: contributor_scores stays locked; only this door opens.
  assert.doesNotMatch(sql, /grant .* on public\.contributor_scores/i);
});

test("handle-less and zero-score contributors are excluded", () => {
  assert.match(sql, /handle is not null/);
  assert.match(sql, /score > 0|sum\([^)]*\) > 0/);
});

test("ties share a rank", () => {
  // rank() would leave gaps and row_number() would break ties arbitrarily,
  // putting two identical contributors in a false order.
  assert.match(sql, /dense_rank\(\) over/);
});

test("the Toastmaker badge uses the app's own quarter format", () => {
  // fetchToastmakerHandle writes and reads `YYYY-Q#`. A mismatch here would
  // silently never match, and with an empty table nobody would notice.
  assert.match(sql, /to_char\(now\(\), 'YYYY'\)/);
  assert.match(sql, /'-Q'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contributor-leaderboard-rpc.test.mjs`
Expected: FAIL — `ENOENT`, the migration does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260814140000_contributor_leaderboard_rpc.sql`:

```sql
-- The public read path for the contributor leaderboard.
--
-- contributor_scores is revoked from anon and authenticated: it exposes
-- per-user activity across every venue, the same shape that got
-- toastmaker_scores locked down in 20260811173852. This function is its only
-- reader, so what it returns IS the public surface.
--
-- It deliberately does not return user_id. A handle is public because the user
-- chose to set one; a user id is a join key into everything else. A boundary
-- that hands out identifiers is not a boundary.
--
-- One board, not one per city: the ten published cities are a single metro
-- (174 venues in Kansas City, 1-6 in each of the others), so ranking per city
-- would split a contributor's score and make "#1 in Westwood" meaningless.
-- primary_city comes back for display, and for sectioning later behind a
-- p_city filter parameter.

create or replace function public.contributor_leaderboard(p_limit int default 10)
returns table (
  rank          int,
  handle        text,
  score         bigint,
  menus         bigint,
  windows       bigint,
  events        bigint,
  is_toastmaker boolean,
  primary_city  text
)
language sql
security definer
set search_path = public
as $$
  with totals as (
    select cs.user_id,
           sum(cs.score)   as score,
           sum(cs.menus)   as menus,
           sum(cs.windows) as windows,
           sum(cs.events)  as events,
           -- Where they earned the most; alphabetical break so the value is
           -- stable across calls rather than arbitrary.
           (array_agg(cs.city order by cs.score desc, cs.city asc))[1] as primary_city
      from public.contributor_scores cs
     group by cs.user_id
  ),
  current_toastmakers as (
    select distinct vt.user_id
      from public.venue_toastmakers vt
     where vt.quarter = to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q')
  )
  select dense_rank() over (order by t.score desc)::int as rank,
         p.handle,
         t.score,
         t.menus,
         t.windows,
         t.events,
         (ct.user_id is not null) as is_toastmaker,
         t.primary_city
    from totals t
    join public.user_profiles p on p.user_id = t.user_id
    left join current_toastmakers ct on ct.user_id = t.user_id
   where p.handle is not null
     and t.score > 0
   order by t.score desc, p.handle asc
   limit p_limit;
$$;

-- The only door. contributor_scores itself stays revoked.
grant execute on function public.contributor_leaderboard(int) to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/contributor-leaderboard-rpc.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Validate the SQL actually runs**

The tests pin text, not behaviour. Validate the query shape read-only against
production the way piece 2's view was, substituting the parts that are not
deployed yet. Because `contributor_scores` only exists once #181 ships, run the
`current_toastmakers` CTE on its own to confirm the quarter expression parses
and matches the stored format:

```sql
select to_char(now(), 'YYYY') || '-Q' || to_char(now(), 'Q') as computed_quarter;
```

Expected: a value like `2026-Q3`. Compare it against
`select distinct quarter from public.venue_toastmakers` if that table ever has
rows; it is empty today, so a format mismatch would not surface at runtime.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260814140000_contributor_leaderboard_rpc.sql test/contributor-leaderboard-rpc.test.mjs
git commit -m "feat(leaderboard): public read path for contributor rankings

A SECURITY DEFINER function is the only reader of contributor_scores, which
stays revoked from anon and authenticated. It never returns user_id: a handle
is public by the user's choice, a user id is a join key into everything else.

One board rather than one per city — the ten published cities are a single
metro, so per-city ranking would split scores and make '#1 in Westwood'
meaningless. primary_city is returned for display and for a later p_city
filter."
```

---

### Task 2: The page

**Files:**
- Create: `apps/directory/src/app/leaderboard/page.tsx`
- Test: `test/contributor-leaderboard-page.test.mjs`

**Interfaces:**
- Consumes: `public.contributor_leaderboard` from Task 1; the anon client
  exported as `supabase` from `apps/directory/src/lib/supabase.ts`.
- Produces: the route `/leaderboard`.

- [ ] **Step 1: Write the failing test**

Create `test/contributor-leaderboard-page.test.mjs`:

```javascript
// test/contributor-leaderboard-page.test.mjs
//
// Three things about this page are load-bearing and easy to undo by accident:
// the toggle, the choice of client, and the empty state.
//
// The client matters most. Reaching for getServiceClient() — as the venue page
// does, because venue_toastmakers is not granted to anon — would put a
// service-role key on a public cacheable route and silently undo the boundary
// the RPC exists to provide.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  join(__dirname, "..", "apps/directory/src/app/leaderboard/page.tsx"),
  "utf8",
);

test("the flag must be exactly 'true' or the route 404s", () => {
  assert.match(page, /LEADERBOARD_ENABLED === 'true'|LEADERBOARD_ENABLED !== 'true'/);
  assert.match(page, /notFound\(\)/);
});

test("the flag is server-side, never NEXT_PUBLIC_", () => {
  // A NEXT_PUBLIC_ flag ships to the browser and advertises an unlaunched
  // feature in the client bundle.
  assert.doesNotMatch(page, /NEXT_PUBLIC_LEADERBOARD/);
});

test("it reads with the anon client, not the service-role one", () => {
  assert.match(page, /from "@\/lib\/supabase"/, "must import the anon client");
  assert.doesNotMatch(page, /getServiceClient|SUPABASE_SERVICE_ROLE_KEY/,
    "a public cacheable page must not hold a service-role key");
});

test("it calls the RPC rather than the scoring view", () => {
  assert.match(page, /rpc\("contributor_leaderboard"|rpc\('contributor_leaderboard'/);
  assert.doesNotMatch(page, /from\("contributor_scores"|from\('contributor_scores'/,
    "the view is revoked from anon; reading it directly would just fail");
});

test("it caches like the rest of the directory", () => {
  assert.match(page, /export const revalidate = 900/);
});

test("the empty state explains rather than showing an empty table", () => {
  // The board ships empty. This is the screen everyone sees on day one.
  assert.match(page, /length === 0|!rows\.length|rows\.length === 0/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contributor-leaderboard-page.test.mjs`
Expected: FAIL — `ENOENT`, the page does not exist.

- [ ] **Step 3: Write the page**

Create `apps/directory/src/app/leaderboard/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

const BASE = "https://happitime.biz";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Top Contributors — HappiTime",
  description:
    "The people keeping Kansas City happy hour listings accurate. Ranked by menus, events, and hours contributed in the last 90 days.",
  alternates: { canonical: `${BASE}/leaderboard/` },
  openGraph: {
    title: "Top Contributors | HappiTime",
    description:
      "The people keeping Kansas City happy hour listings accurate.",
    url: `${BASE}/leaderboard/`,
    type: "website",
    siteName: "HappiTime",
  },
};

type Row = {
  rank: number;
  handle: string;
  score: number;
  menus: number;
  windows: number;
  events: number;
  is_toastmaker: boolean;
  primary_city: string | null;
};

/** "3 menus · 2 events" — omits the zeroes so the line stays readable. */
function breakdown(r: Row): string {
  const parts: string[] = [];
  if (r.menus) parts.push(`${r.menus} menu${r.menus === 1 ? "" : "s"}`);
  if (r.events) parts.push(`${r.events} event${r.events === 1 ? "" : "s"}`);
  if (r.windows) parts.push(`${r.windows} hour${r.windows === 1 ? "" : "s"} set`);
  return parts.join(" · ");
}

export default async function LeaderboardPage() {
  // Server-side flag, deliberately not NEXT_PUBLIC_: the page is
  // server-rendered, so the value has no reason to reach the browser and an
  // unlaunched feature should not appear in the client bundle.
  if (process.env.LEADERBOARD_ENABLED !== "true") notFound();

  // The anon client, not a service-role one. contributor_scores is revoked;
  // this RPC is granted to anon and returns only publishable columns, so the
  // database is the boundary rather than this file.
  const { data } = await supabase.rpc("contributor_leaderboard", { p_limit: 10 });
  const rows = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold text-foreground tracking-tight">Top Contributors</h1>
      <p className="text-muted mt-2">
        The people keeping happy hour listings accurate. Ranked by what they have added in
        the last 90 days.
      </p>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="font-medium text-foreground">No rankings yet</p>
          <p className="text-muted mt-1">
            Contributions are still being published. Rankings appear here as menus and
            events go live.
          </p>
        </div>
      ) : (
        <ol className="mt-10 flex flex-col gap-3">
          {rows.map((r) => (
            <li
              key={r.handle}
              className="flex items-center gap-4 rounded-lg border border-border bg-surface px-5 py-4"
            >
              <span className="w-8 shrink-0 text-lg font-bold tabular-nums text-muted">
                {r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">@{r.handle}</span>
                  {r.is_toastmaker ? (
                    <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-dark">
                      Toastmaker
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-muted mt-0.5">
                  {breakdown(r)}
                  {r.primary_city ? ` · ${r.primary_city}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-lg font-bold tabular-nums text-foreground">
                {r.score}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/contributor-leaderboard-page.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck the directory**

Run: `npm run typecheck --workspace directory`
Expected: clean. If `rpc()` complains about the untyped function name, the
generated Supabase types do not know it yet; cast the call:
`await (supabase.rpc as any)("contributor_leaderboard", { p_limit: 10 })`.

- [ ] **Step 6: Commit**

```bash
git add apps/directory/src/app/leaderboard/page.tsx test/contributor-leaderboard-page.test.mjs
git commit -m "feat(leaderboard): the public page

Reads through the RPC with the anon client — no service-role key on a public
cacheable route. Server-side LEADERBOARD_ENABLED gates it; anything other than
exactly 'true' 404s, so a disabled board is not discoverable or indexable.

The empty state is the screen everyone sees on day one, so it explains rather
than rendering an empty table."
```

---

### Task 3: Nav link and the documented flag

**Files:**
- Modify: `apps/directory/src/components/SiteNav.tsx`
- Modify: `apps/directory/.env.example`
- Modify: `test/contributor-leaderboard-page.test.mjs`

**Interfaces:**
- Consumes: the `/leaderboard` route from Task 2.
- Produces: nothing new.

`SiteNav` renders in the client bundle, but `LEADERBOARD_ENABLED` is
server-side and must stay there. So the flag is read in `layout.tsx` — a server
component — and only the resulting boolean is passed down as a prop. The nav
never sees the env var, and a disabled board leaves no link pointing at a 404.

- [ ] **Step 1: Write the failing test**

Append to `test/contributor-leaderboard-page.test.mjs`:

```javascript
test("the nav link is gated by the same flag as the page", () => {
  // A link to a 404 is worse than no link. Whatever renders it must consult
  // the same server-side flag.
  const nav = readFileSync(
    join(__dirname, "..", "apps/directory/src/components/SiteNav.tsx"),
    "utf8",
  );
  assert.match(nav, /leaderboard/i, "the nav must know about the route");
  assert.match(nav, /showLeaderboard/, "gated by an explicit prop, not by guessing");
});

test("the flag is documented for operators", () => {
  const env = readFileSync(
    join(__dirname, "..", "apps/directory/.env.example"),
    "utf8",
  );
  assert.match(env, /LEADERBOARD_ENABLED/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_LEADERBOARD_ENABLED/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contributor-leaderboard-page.test.mjs`
Expected: FAIL on the two new tests.

- [ ] **Step 3: Add the prop to SiteNav**

In `apps/directory/src/components/SiteNav.tsx`, change the signature and add
the link beside the existing `/guides/` entry:

```tsx
export function SiteNav({ showLeaderboard = false }: { showLeaderboard?: boolean }) {
```

Then, immediately after the `/guides/` `<Link>` in the desktop nav:

```tsx
        {showLeaderboard ? (
          <Link href="/leaderboard/" className="hover:text-foreground transition-colors">
            Top Contributors
          </Link>
        ) : null}
```

And the same block after the `/guides/` link in the mobile menu.

- [ ] **Step 4: Pass the flag from the layout**

In `apps/directory/src/app/layout.tsx`, in `SiteHeader`:

```tsx
        <SiteNav showLeaderboard={process.env.LEADERBOARD_ENABLED === "true"} />
```

`layout.tsx` is a server component, so the env var is read on the server and
only the resulting boolean reaches the client.

- [ ] **Step 5: Document the flag**

In `apps/directory/.env.example`, under the existing feature-flags block:

```bash
# Contributor leaderboard at /leaderboard. Server-side on purpose — do NOT
# prefix with NEXT_PUBLIC_. Anything other than exactly "true" 404s the route
# and hides the nav link. Leave unset until at least one contributor ranks;
# the board is empty until a super user's contribution is published.
# LEADERBOARD_ENABLED=
```

- [ ] **Step 6: Run tests and typecheck**

Run: `node --test test/contributor-leaderboard-page.test.mjs`
Expected: PASS, 8 tests.

Run: `npm run typecheck --workspace directory`
Expected: clean.

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add apps/directory/src/components/SiteNav.tsx apps/directory/src/app/layout.tsx apps/directory/.env.example test/contributor-leaderboard-page.test.mjs
git commit -m "feat(leaderboard): gated nav link and documented flag

The layout reads the server-side flag and passes a boolean, so the value never
reaches the client bundle and a disabled board leaves no link to a 404."
```

---

## Done when

- `npm test` passes. Baseline 559; this plan adds 14 tests (6 RPC + 8 page/nav), so expect **573** — or **593** if #181 has landed first, since it adds 20.
- `npm run typecheck --workspace directory` is clean.
- The migration applies on a fresh `npx supabase db reset`.
- With `LEADERBOARD_ENABLED` unset, `/leaderboard` returns 404 and no nav link renders.
- With it set to `true` and no ranked contributors, the page renders the empty state rather than an empty table.
- `select * from public.contributor_scores` as `anon` still fails — the view was never granted.

## Explicitly not in this plan

- **Enabling the flag.** The board is empty until a super user's contribution is published. Shipping it on would publish an empty page.
- **Per-city sections.** Needs a `p_city` filter parameter on the RPC; the metro does not warrant it yet.
- **Opening the board to regular users.** Piece 2's view already admits the `user` tier, so they appear the day such contributions exist.
- **Restructuring `apps/android`** onto the iOS pattern — its own design round.
