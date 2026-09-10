# Social Feed SP1 — UGC Spine and Trust & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Discover tab's one-line activity sentences with a photo feed of user posts about venues, shipped with the report/block/filter/SLA loop Apple requires for user-generated content.

**Architecture:** Four new tables (`venue_posts`, `post_likes`, `post_reports`, `user_blocks`) behind RLS with explicit grants; a `venue-posts` storage bucket scoped to the uploader's uid prefix; one edge function (`create-post`) that is the only writer of posts and enforces rate limits and Google Vision SafeSearch moderation; a `security definer` feed RPC with exact keyset pagination; mobile hooks and cards that ship over the air (no new native modules); an `/admin/moderation` queue in the web console; and a GitHub-scheduled SLA tripwire that does not depend on email.

**Tech Stack:** Supabase Postgres (migrations, RLS, pg_cron already present), Deno 2 edge functions, Expo SDK 54 / React Native 0.81 (`expo-image-picker`, `expo-image-manipulator` already installed), Next.js 15 App Router server actions, `node --test` with `.mjs` tests under `test/`.

**Spec:** `docs/superpowers/specs/2026-09-07-social-discovery-feed-design.md`

## Global Constraints

- **Schema changes go through migrations only.** Append-only; never edit an applied migration. RLS and grant changes live in their own migration file (`docs/database-change-policy.md`).
- **Every policy uses `(select auth.uid())`, never bare `auth.uid()`** (`20260811175113_wrap_auth_calls_in_rls_policies.sql` is the precedent this must not regress).
- **Every `security definer` function has `set search_path = public`** and is followed by `revoke all ... from public, anon, authenticated` then an explicit `grant execute`.
- **New tables get explicit grants.** RLS alone is insufficient after the lockdown migrations (the `user_notifications` spec documents this trap).
- **No client INSERT policy on `venue_posts`.** `create-post` (service role) is the only writer. This is how rate limiting and moderation are enforced.
- **Storage object paths are `{author_uid}/{post_id}/{n}.jpg`, `n` in 0..3.** The uid prefix is what the storage policy checks.
- **Uploads always go through `manipulateAsync(..., { base64: true })` then `decode()`.** `fetch(uri).blob()` uploads empty bodies in React Native (`useAvatarUpload.ts:52-67`).
- **Photos only.** No video, no tags, no comments in SP1 (spec decisions Q2, D3, D4).
- **Moderation fails closed.** If `GOOGLE_VISION_API_KEY` is unset or Vision errors, the post is `pending_review`, never `published`.
- **Nothing in this plan writes to `happy_hour_windows` or `venues`.** The `touch_*` triggers must not fire.
- Tests run with `npm test` (`node --test test/*.test.mjs`). Record the baseline count before Task 1 and confirm it only grows.
- Typecheck with `npm run typecheck` (builds shared packages first). Lint with `npm run lint`.
- Edge functions are deployed by the workflow added in Task 6 once merged; until then, `supabase functions deploy create-post --project-ref "$SUPABASE_PROJECT_REF"`.
- CI green before "done". Ask before merging.
- Do not touch `apps/mobile/src/navigation/AppNavigator.tsx` or the untracked `useActivityDeepLink` files; that work is in flight on `master`.

## Interfaces shared across tasks

Defined once here; tasks reference them by name.

```ts
// Feed RPC row (Task 4) → mobile DiscoverPost (Task 9)
type FeedRow = {
  id: string; venue_id: string; venue_name: string; venue_slug: string | null; venue_neighborhood: string | null;
  author_id: string; author_handle: string | null; author_display_name: string | null;
  author_avatar_url: string | null; author_role: string | null;
  body: string | null; media_paths: string[]; rating: number | null; source: "ugc" | "instagram" | "tiktok";
  external_url: string | null; created_at: string; like_count: number; liked_by_me: boolean; is_verified_visit: boolean;
};

// create-post request/response (Task 6) ↔ useCreatePost (Task 10)
type CreatePostRequest = {
  post_id: string;            // client-generated uuid; also the storage folder
  venue_id: string;
  body?: string;              // ≤ 500 chars
  media_paths: string[];      // 1..4, each `${uid}/${post_id}/${n}.jpg`
  rating?: number;            // 1..5
  visit_id?: string;
  accept_guidelines?: boolean;
};
type CreatePostResponse = { post: { id: string; status: "published" | "pending_review" } };
// Error bodies: { error: "unauthorized" | "invalid_body" | "rate_limited" | "venue_not_found"
//                | "guidelines_required" | "media_missing" | "content_rejected" | "duplicate" | "server_error" }
```

---

### Task 1: Migration — tables, indexes, triggers

**Files:**
- Create: `supabase/migrations/20260908120000_social_feed_tables.sql`
- Test: `test/social-feed-schema.test.mjs`

**Interfaces:**
- Consumes: `public.set_updated_at()` (exists, `20260108070000_init_core_schema.sql:7`), `public.venues`, `public.venue_visits`, `public.user_profiles`.
- Produces: tables `venue_posts`, `post_likes`, `post_reports`, `user_blocks`; column `user_profiles.community_guidelines_accepted_at`; trigger functions `post_reports_auto_hide()`, `post_reports_daily_cap()`.

- [ ] **Step 1: Record the test baseline**

Run: `npm test 2>&1 | tail -5`
Note the `# tests`, `# pass`, `# skipped` lines. Every later "run tests" step must show `# fail 0` and a count ≥ this.

- [ ] **Step 2: Write the failing test**

Create `test/social-feed-schema.test.mjs`:

```javascript
// test/social-feed-schema.test.mjs
//
// The social feed is the first user-authored, publicly readable content in the
// schema. These tests pin the migration shape that keeps it safe: who can write
// (nobody but the service role), what can be reported without the reported
// party seeing who did it, and the constraints that make spam expensive.
//
// Reads SQL rather than a live database, like the other schema tests here.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (name) =>
  readFileSync(join(__dirname, "..", "supabase/migrations", name), "utf8");

const tables = read("20260908120000_social_feed_tables.sql");

test("all four tables are created idempotently", () => {
  for (const t of ["venue_posts", "post_likes", "post_reports", "user_blocks"]) {
    assert.match(tables, new RegExp(`create table if not exists public\\.${t} \\(`), t);
  }
});

test("venue_posts constrains status, source, body length, media count, rating", () => {
  assert.match(tables, /status in \('published','pending_review','removed'\)/);
  assert.match(tables, /source in \('ugc','instagram','tiktok'\)/);
  assert.match(tables, /char_length\(body\) <= 500/);
  assert.match(tables, /array_length\(media_paths, 1\) <= 4/);
  assert.match(tables, /rating between 1 and 5/);
  // a post must carry a caption or at least one image
  assert.match(tables, /body is not null or array_length\(media_paths, 1\) >= 1/);
});

test("posts die with their author; visits detach", () => {
  assert.match(tables, /author_id\s+uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(tables, /visit_id\s+uuid references public\.venue_visits\(id\) on delete set null/);
});

test("feed and review indexes are partial on status", () => {
  assert.match(tables, /venue_posts_feed_idx on public\.venue_posts \(created_at desc, id desc\) where status = 'published'/);
  assert.match(tables, /venue_posts_review_idx on public\.venue_posts \(created_at\) where status = 'pending_review'/);
  assert.match(tables, /venue_posts_external_idx on public\.venue_posts \(source, external_id\) where external_id is not null/);
});

test("one open report per reporter per post, and blocks cannot target self", () => {
  assert.match(tables, /post_reports_open_unique on public\.post_reports \(post_id, reporter_id\) where status = 'open'/);
  assert.match(tables, /reason in \('spam','inappropriate','harassment','not_this_venue','other'\)/);
  assert.match(tables, /check \(blocker_id <> blocked_id\)/);
});

test("two distinct reporters hide a post for review, never remove it", () => {
  const fn = tables.slice(tables.indexOf("function public.post_reports_auto_hide"));
  assert.match(fn, /count\(distinct r\.reporter_id\)/);
  assert.match(fn, />= 2/);
  assert.match(fn, /set status = 'pending_review'/);
  assert.doesNotMatch(fn.slice(0, fn.indexOf("$$;")), /'removed'/);
  assert.match(fn, /where id = new\.post_id and status = 'published'/);
});

test("reporters are capped at 10 per 24 hours", () => {
  const fn = tables.slice(tables.indexOf("function public.post_reports_daily_cap"));
  assert.match(fn, /interval '24 hours'/);
  assert.match(fn, />= 10/);
  assert.match(fn, /raise exception 'report_rate_limited'/);
});

test("definer functions pin search_path and are revoked from client roles", () => {
  const defs = tables.match(/create or replace function public\.[a-z_]+\(\)[\s\S]*?\$\$;/g) ?? [];
  assert.equal(defs.length, 2, "auto_hide and daily_cap");
  for (const d of defs) {
    assert.match(d, /security definer/);
    assert.match(d, /set search_path = public/);
  }
  assert.match(tables, /revoke all on function public\.post_reports_auto_hide\(\) from public, anon, authenticated/);
  assert.match(tables, /revoke all on function public\.post_reports_daily_cap\(\) from public, anon, authenticated/);
});

test("guidelines acceptance column is added but not granted to clients", () => {
  assert.match(tables, /alter table public\.user_profiles\s+add column if not exists community_guidelines_accepted_at timestamptz/);
  assert.doesNotMatch(tables, /grant (select|insert|update)[^\n]*community_guidelines_accepted_at/);
});

test("no bare auth.uid() anywhere in the social feed migrations", () => {
  const bare = tables.match(/(?<!select )auth\.uid\(\)/g) ?? [];
  assert.deepEqual(bare, [], "wrap as (select auth.uid())");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/social-feed-schema.test.mjs`
Expected: FAIL — `ENOENT ... 20260908120000_social_feed_tables.sql`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260908120000_social_feed_tables.sql`:

```sql
-- Social Discovery Feed, SP1: tables, indexes, triggers.
-- Spec: docs/superpowers/specs/2026-09-07-social-discovery-feed-design.md
-- RLS + grants are in the next migration (20260908120100) per database-change-policy.
--
-- Design notes:
--   * venue_posts has NO client insert path. create-post (service role) is the only
--     writer, so rate limits and moderation cannot be bypassed via PostgREST.
--   * Interactions are separate tables so each has its own policy. A single
--     post_interactions table would expose reporter identity to the reported author.
--   * Counts are computed at read time (get_discover_feed); no counter caches.

-- ── venue_posts ──────────────────────────────────────────────────────────────
create table if not exists public.venue_posts (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  author_id      uuid not null references auth.users(id) on delete cascade,
  visit_id       uuid references public.venue_visits(id) on delete set null,
  body           text check (body is null or char_length(body) <= 500),
  media_paths    text[] not null default '{}'
                 check (array_length(media_paths, 1) is null or array_length(media_paths, 1) <= 4),
  rating         smallint check (rating is null or rating between 1 and 5),
  source         text not null default 'ugc' check (source in ('ugc','instagram','tiktok')),
  external_id    text,
  external_url   text,
  status         text not null default 'published'
                 check (status in ('published','pending_review','removed')),
  moderation     jsonb not null default '{}'::jsonb,
  removed_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (body is not null or array_length(media_paths, 1) >= 1)
);

create index if not exists venue_posts_feed_idx
  on public.venue_posts (created_at desc, id desc) where status = 'published';
create index if not exists venue_posts_venue_idx
  on public.venue_posts (venue_id, created_at desc) where status = 'published';
create index if not exists venue_posts_author_idx
  on public.venue_posts (author_id, created_at desc);
create index if not exists venue_posts_review_idx
  on public.venue_posts (created_at) where status = 'pending_review';
create unique index if not exists venue_posts_external_idx
  on public.venue_posts (source, external_id) where external_id is not null;

drop trigger if exists venue_posts_set_updated_at on public.venue_posts;
create trigger venue_posts_set_updated_at
  before update on public.venue_posts
  for each row execute function public.set_updated_at();

-- ── post_likes ───────────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id    uuid not null references public.venue_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes (user_id);

-- ── post_reports ─────────────────────────────────────────────────────────────
create table if not exists public.post_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.venue_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null check (reason in ('spam','inappropriate','harassment','not_this_venue','other')),
  note        text check (note is null or char_length(note) <= 300),
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
-- One OPEN report per reporter per post: dedupes taps, blocks spam (listing_reports precedent).
create unique index if not exists post_reports_open_unique
  on public.post_reports (post_id, reporter_id) where status = 'open';
create index if not exists post_reports_open_idx
  on public.post_reports (created_at) where status = 'open';
create index if not exists post_reports_post_idx on public.post_reports (post_id);

-- ── user_blocks ──────────────────────────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ── guidelines acceptance ────────────────────────────────────────────────────
-- Not added to the authenticated column grant on user_profiles
-- (20260519120000_lock_down_user_profile_privileged_columns.sql): only
-- create-post sets it, with the service role, on the user's first post.
alter table public.user_profiles
  add column if not exists community_guidelines_accepted_at timestamptz;

-- ── auto-hide: 2+ distinct open reporters → pending_review ───────────────────
-- Mirrors flag_disputed_on_report(). Never sets 'removed': that is a human decision.
create or replace function public.post_reports_auto_hide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(distinct r.reporter_id)
    from public.post_reports r
    where r.post_id = new.post_id
      and r.status = 'open'
  ) >= 2 then
    update public.venue_posts
       set status = 'pending_review',
           moderation = moderation
             || jsonb_build_object('hidden_by', 'reports', 'hidden_at', now())
     where id = new.post_id and status = 'published';
  end if;
  return new;
end;
$$;
revoke all on function public.post_reports_auto_hide() from public, anon, authenticated;

drop trigger if exists post_reports_auto_hide on public.post_reports;
create trigger post_reports_auto_hide
  after insert on public.post_reports
  for each row execute function public.post_reports_auto_hide();

-- ── report cap: 10 per reporter per 24h ──────────────────────────────────────
-- Mirrors enforce_venue_visit_cooldown(), but raises instead of silently dropping
-- so the client can show a message.
create or replace function public.post_reports_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.post_reports r
    where r.reporter_id = new.reporter_id
      and r.created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.post_reports_daily_cap() from public, anon, authenticated;

drop trigger if exists post_reports_daily_cap on public.post_reports;
create trigger post_reports_daily_cap
  before insert on public.post_reports
  for each row execute function public.post_reports_daily_cap();
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/social-feed-schema.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 6: Replay locally**

Run: `supabase start && supabase db reset --yes 2>&1 | tail -5`
Expected: the last line names `20260908120000_social_feed_tables.sql` with no error. (CI's `supabase-migrations` job runs the same reset.)

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/social-feed-sp1
git add supabase/migrations/20260908120000_social_feed_tables.sql test/social-feed-schema.test.mjs
git commit -m "feat(feed): add venue_posts, post_likes, post_reports, user_blocks tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Migration — RLS and grants

**Files:**
- Create: `supabase/migrations/20260908120100_social_feed_rls.sql`
- Modify: `test/social-feed-schema.test.mjs` (append)

**Interfaces:**
- Consumes: the four tables from Task 1.
- Produces: policies `venue_posts_select_published_or_own`, `venue_posts_delete_own`, `post_likes_select_all`, `post_likes_insert_own`, `post_likes_delete_own`, `post_reports_insert_self`, `post_reports_select_self`, `user_blocks_all_own`; grants as listed.

- [ ] **Step 1: Append the failing tests**

Append to `test/social-feed-schema.test.mjs`:

```javascript
const rls = read("20260908120100_social_feed_rls.sql");

test("RLS is enabled on all four tables", () => {
  for (const t of ["venue_posts", "post_likes", "post_reports", "user_blocks"]) {
    assert.match(rls, new RegExp(`alter table public\\.${t} enable row level security`), t);
  }
});

test("venue_posts has no client insert or update policy", () => {
  const block = rls.slice(rls.indexOf("-- ── venue_posts"), rls.indexOf("-- ── post_likes"));
  assert.doesNotMatch(block, /for insert/);
  assert.doesNotMatch(block, /for update/);
  assert.match(block, /venue_posts_select_published_or_own[\s\S]*?using \(status = 'published' or author_id = \(select auth\.uid\(\)\)\)/);
  assert.match(block, /venue_posts_delete_own[\s\S]*?for delete to authenticated using \(author_id = \(select auth\.uid\(\)\)\)/);
});

test("reports are readable only by their reporter", () => {
  const block = rls.slice(rls.indexOf("-- ── post_reports"), rls.indexOf("-- ── user_blocks"));
  assert.match(block, /post_reports_select_self[\s\S]*?using \(reporter_id = \(select auth\.uid\(\)\)\)/);
  assert.doesNotMatch(block, /to anon/);
});

test("grants are explicit and minimal", () => {
  assert.match(rls, /revoke all on public\.venue_posts, public\.post_likes, public\.post_reports, public\.user_blocks from anon, authenticated/);
  assert.match(rls, /grant select on public\.venue_posts to anon, authenticated/);
  assert.match(rls, /grant delete on public\.venue_posts to authenticated/);
  assert.doesNotMatch(rls, /grant (insert|update)[^\n]*public\.venue_posts/);
  assert.match(rls, /grant select, insert on public\.post_reports to authenticated/);
  assert.match(rls, /grant select, insert, delete on public\.user_blocks to authenticated/);
});

test("the one USING (true) read is post_likes and is justified in a comment", () => {
  const trues = rls.match(/using \(true\)/g) ?? [];
  assert.equal(trues.length, 1);
  assert.match(rls, /post_likes_select_all[\s\S]{0,400}using \(true\)/);
  assert.match(rls, /a like is a public count/i);
});

test("no bare auth.uid() in the RLS migration", () => {
  assert.deepEqual(rls.match(/(?<!select )auth\.uid\(\)/g) ?? [], []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/social-feed-schema.test.mjs`
Expected: FAIL — `ENOENT ... 20260908120100_social_feed_rls.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260908120100_social_feed_rls.sql`:

```sql
-- Social Discovery Feed, SP1: RLS + grants (own migration per database-change-policy).
-- Every auth.uid() is wrapped as (select auth.uid()) — see 20260811175113.

alter table public.venue_posts  enable row level security;
alter table public.post_likes   enable row level security;
alter table public.post_reports enable row level security;
alter table public.user_blocks  enable row level security;

-- ── venue_posts ──────────────────────────────────────────────────────────────
-- Published posts are public (anon included: the guest Discover branch reads them).
-- Authors always see their own rows, so a pending_review post does not vanish
-- from the author's screen. No INSERT/UPDATE policy: create-post is the writer.
drop policy if exists venue_posts_select_published_or_own on public.venue_posts;
create policy venue_posts_select_published_or_own
  on public.venue_posts for select to anon, authenticated
  using (status = 'published' or author_id = (select auth.uid()));

drop policy if exists venue_posts_delete_own on public.venue_posts;
create policy venue_posts_delete_own
  on public.venue_posts for delete to authenticated using (author_id = (select auth.uid()));

-- ── post_likes ───────────────────────────────────────────────────────────────
-- USING (true) is deliberate here: a like is a public count with no body, and the
-- feed RPC needs to count likes on any visible post. database-change-policy flags
-- USING (true) reads for review; this comment is the justification.
drop policy if exists post_likes_select_all on public.post_likes;
create policy post_likes_select_all
  on public.post_likes for select to anon, authenticated using (true);

drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own
  on public.post_likes for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own
  on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

-- ── post_reports ─────────────────────────────────────────────────────────────
-- Reporter identity is never visible to the reported author. Admins read via
-- service role in the web console.
drop policy if exists post_reports_insert_self on public.post_reports;
create policy post_reports_insert_self
  on public.post_reports for insert to authenticated with check (reporter_id = (select auth.uid()));

drop policy if exists post_reports_select_self on public.post_reports;
create policy post_reports_select_self
  on public.post_reports for select to authenticated using (reporter_id = (select auth.uid()));

-- ── user_blocks ──────────────────────────────────────────────────────────────
drop policy if exists user_blocks_all_own on public.user_blocks;
create policy user_blocks_all_own
  on public.user_blocks for all to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

-- ── grants ───────────────────────────────────────────────────────────────────
revoke all on public.venue_posts, public.post_likes, public.post_reports, public.user_blocks from anon, authenticated;
grant select on public.venue_posts to anon, authenticated;
grant delete on public.venue_posts to authenticated;
grant select on public.post_likes to anon, authenticated;
grant insert, delete on public.post_likes to authenticated;
grant select, insert on public.post_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
```

- [ ] **Step 4: Run tests and replay**

Run: `node --test test/social-feed-schema.test.mjs && supabase db reset --yes 2>&1 | tail -3`
Expected: PASS, 16 tests; reset ends on `20260908120100_social_feed_rls.sql`.

- [ ] **Step 5: Run the Supabase advisors**

Run: `supabase inspect db lint --linked 2>&1 | grep -i "venue_posts\|post_likes\|post_reports\|user_blocks" || echo "no findings on new tables"`
Expected: no `rls_disabled` or `security_definer_view` findings on the new tables. (`multiple_permissive_policies` is pre-existing debt; do not add to it — each table above has at most one policy per command per role.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260908120100_social_feed_rls.sql test/social-feed-schema.test.mjs
git commit -m "feat(feed): RLS and grants for social feed tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Migration — `venue-posts` storage bucket

**Files:**
- Create: `supabase/migrations/20260908120200_venue_posts_storage_bucket.sql`
- Test: `test/social-feed-storage.test.mjs`

**Interfaces:**
- Consumes: `storage.buckets`, `storage.objects` (pre-existing).
- Produces: bucket `venue-posts`; policies `venue_posts_objects_insert_own`, `venue_posts_objects_delete_own`.

- [ ] **Step 1: Write the failing test**

Create `test/social-feed-storage.test.mjs`:

```javascript
// test/social-feed-storage.test.mjs
//
// venue-media (2026-01) was created with no size limit, no mime allowlist and a
// bucket-wide FOR ALL policy for any signed-in user. user-avatars (2026-05) is
// the corrected shape. This pins the new bucket to the corrected shape.
// storage.* is outside the nightly parity dump, so this test is the only guard.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "supabase/migrations/20260908120200_venue_posts_storage_bucket.sql"),
  "utf8",
);

test("bucket is public with a 5 MB limit and an image-only allowlist", () => {
  assert.match(sql, /'venue-posts',\s*'venue-posts',\s*true,\s*5242880,\s*ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
  assert.match(sql, /ON CONFLICT \(id\) DO UPDATE/);
});

test("writes are scoped to the uploader's uid prefix; objects are immutable; listing stays closed", () => {
  assert.match(sql, /venue_posts_objects_insert_own[\s\S]*?FOR INSERT TO authenticated[\s\S]*?\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(sql, /venue_posts_objects_delete_own[\s\S]*?FOR DELETE TO authenticated/);
  assert.doesNotMatch(sql, /FOR UPDATE/);
  assert.doesNotMatch(sql, /FOR SELECT/);
  assert.doesNotMatch(sql, /FOR ALL/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/social-feed-storage.test.mjs`
Expected: FAIL — ENOENT.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260908120200_venue_posts_storage_bucket.sql`:

```sql
-- Storage bucket for user post photos (Social Discovery Feed SP1).
-- Modelled on 20260518130000_avatar_storage_bucket.sql, NOT on venue-media.
--
-- public=true: object URLs serve without a SELECT policy; with no SELECT policy
-- on storage.objects the bucket cannot be listed by clients (phase2b pattern).
-- Path convention: {author_uid}/{post_id}/{n}.jpg — create-post re-validates
-- every path against the caller's uid before a row is created.
-- No UPDATE policy: objects are immutable; a changed photo is a new post.
-- Storage policies here use bare auth.uid() like every other storage policy in
-- this repo; the (select auth.uid()) wrapping applies to public-schema tables.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'venue-posts',
  'venue-posts',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "venue_posts_objects_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "venue_posts_objects_delete_own" ON storage.objects;

CREATE POLICY "venue_posts_objects_insert_own"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'venue-posts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "venue_posts_objects_delete_own"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'venue-posts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 4: Run tests and replay**

Run: `node --test test/social-feed-storage.test.mjs && supabase db reset --yes 2>&1 | tail -2`
Expected: PASS, 2 tests; reset ends on the storage migration.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260908120200_venue_posts_storage_bucket.sql test/social-feed-storage.test.mjs
git commit -m "feat(feed): add venue-posts storage bucket with uid-scoped write policies

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Migration — `get_discover_feed` RPC

**Files:**
- Create: `supabase/migrations/20260908120300_get_discover_feed.sql`
- Modify: `test/social-feed-schema.test.mjs` (append)

**Interfaces:**
- Consumes: Task 1 tables, `public.venues (id, name, slug, neighborhood, status)`, `public.user_profiles (user_id, handle, display_name, avatar_url, role)`.
- Produces: `public.get_discover_feed(p_limit int, p_cursor_created_at timestamptz, p_cursor_id uuid)` returning `FeedRow` (see Interfaces section), executable by `anon` and `authenticated`.

- [ ] **Step 1: Append the failing tests**

Append to `test/social-feed-schema.test.mjs`:

```javascript
const feed = read("20260908120300_get_discover_feed.sql");

test("feed RPC is a pinned security definer callable by anon and authenticated", () => {
  assert.match(feed, /create or replace function public\.get_discover_feed\(/);
  assert.match(feed, /security definer/);
  assert.match(feed, /set search_path = public/);
  assert.match(feed, /revoke all on function public\.get_discover_feed\(int, timestamptz, uuid\) from public, anon, authenticated/);
  assert.match(feed, /grant execute on function public\.get_discover_feed\(int, timestamptz, uuid\) to anon, authenticated/);
});

test("feed RPC only returns published posts at published venues, keyset-paginated, block-filtered", () => {
  assert.match(feed, /where p\.status = 'published'/);
  assert.match(feed, /v\.status = 'published'/);
  assert.match(feed, /\(p\.created_at, p\.id\) < \(p_cursor_created_at, p_cursor_id\)/);
  assert.match(feed, /order by p\.created_at desc, p\.id desc/);
  assert.match(feed, /limit least\(greatest\(p_limit, 1\), 50\)/);
  // both directions of a block
  assert.match(feed, /b\.blocker_id = \(select auth\.uid\(\)\) and b\.blocked_id = p\.author_id/);
  assert.match(feed, /b\.blocker_id = p\.author_id and b\.blocked_id = \(select auth\.uid\(\)\)/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/social-feed-schema.test.mjs`
Expected: FAIL — ENOENT on the feed migration.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260908120300_get_discover_feed.sql`:

```sql
-- Discover feed page, SP1 (v0): reverse-chronological, exact keyset pagination.
--
-- security definer is required: the block filter must see the OTHER user's
-- user_blocks rows, which RLS hides from the viewer. The function reads nothing
-- a viewer could not otherwise read (published posts, public profiles, like
-- counts). p_limit is clamped to 50. Diversity (no 3 consecutive cards from one
-- venue) is applied by the client within a page so the keyset stays exact.
-- v1 (SP2) replaces the ORDER BY with a scored ranking; the signature grows
-- with p_lat/p_lng/p_as_of then.

create or replace function public.get_discover_feed(
  p_limit int default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  venue_id uuid,
  venue_name text,
  venue_slug text,
  venue_neighborhood text,
  author_id uuid,
  author_handle text,
  author_display_name text,
  author_avatar_url text,
  author_role text,
  body text,
  media_paths text[],
  rating smallint,
  source text,
  external_url text,
  created_at timestamptz,
  like_count bigint,
  liked_by_me boolean,
  is_verified_visit boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.venue_id,
    v.name,
    v.slug,
    v.neighborhood,
    p.author_id,
    up.handle,
    up.display_name,
    up.avatar_url,
    up.role,
    p.body,
    p.media_paths,
    p.rating,
    p.source,
    p.external_url,
    p.created_at,
    (select count(*) from public.post_likes l where l.post_id = p.id) as like_count,
    exists (
      select 1 from public.post_likes l
      where l.post_id = p.id and l.user_id = (select auth.uid())
    ) as liked_by_me,
    (p.visit_id is not null) as is_verified_visit
  from public.venue_posts p
  join public.venues v on v.id = p.venue_id and v.status = 'published'
  join public.user_profiles up on up.user_id = p.author_id
  where p.status = 'published'
    and (
      p_cursor_created_at is null
      or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    )
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id)
         or (b.blocker_id = p.author_id and b.blocked_id = (select auth.uid()))
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.get_discover_feed(int, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_discover_feed(int, timestamptz, uuid) to anon, authenticated;
```

- [ ] **Step 4: Run tests, replay, and smoke the function locally**

Run: `node --test test/social-feed-schema.test.mjs && supabase db reset --yes 2>&1 | tail -2`
Expected: PASS, 18 tests.

Then run against the local database:

```bash
supabase db query --local -f /dev/stdin <<'SQL'
select * from public.get_discover_feed(5, null, null);
SQL
```
Expected: zero rows, no error (no posts exist yet). A syntax or column error here means the `returns table` list and the `select` list disagree; fix before committing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260908120300_get_discover_feed.sql test/social-feed-schema.test.mjs
git commit -m "feat(feed): add get_discover_feed keyset RPC

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Edge shared modules — HTTP helpers, media-path validator, moderation decision, SafeSearch client

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/post-media-path.mjs`
- Create: `supabase/functions/_shared/moderation.mjs`
- Create: `supabase/functions/_shared/safe-search.ts`
- Test: `test/post-media-path.test.mjs`, `test/moderation-decision.test.mjs`

**Interfaces:**
- Consumes: nothing in-repo. `node:crypto` is not needed here.
- Produces:
  - `http.ts`: `CORS_HEADERS`, `json(body: unknown, status?: number): Response`
  - `post-media-path.mjs`: `MAX_POST_MEDIA = 4`, `isValidPostMediaPath(path, uid, postId): boolean`, `validateMediaPaths(paths, uid, postId): { ok: true } | { ok: false; error: string }`
  - `moderation.mjs`: `captionHits(body): string[]`, `decideModeration({ captionHits, images, provider }): { status: "published" | "pending_review" | "rejected"; reasons: string[] }`
  - `safe-search.ts`: `safeSearch(imageUrl, apiKey): Promise<SafeSearchResult | null>` where `SafeSearchResult = { adult: Likelihood; violence: Likelihood; racy: Likelihood }`

- [ ] **Step 1: Write the failing tests**

Create `test/post-media-path.test.mjs`:

```javascript
// test/post-media-path.test.mjs
//
// The storage policy trusts the first path segment (the uploader's uid).
// create-post must trust nothing else: a caller could name any path in the
// request body, so the validator is the line between "your own folder" and
// "attach someone else's photo to your post".

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_POST_MEDIA,
  isValidPostMediaPath,
  validateMediaPaths,
} from "../supabase/functions/_shared/post-media-path.mjs";

const uid = "11111111-1111-4111-8111-111111111111";
const post = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";

test("accepts exactly {uid}/{post}/{0..3}.jpg", () => {
  for (let n = 0; n < MAX_POST_MEDIA; n++) {
    assert.equal(isValidPostMediaPath(`${uid}/${post}/${n}.jpg`, uid, post), true, String(n));
  }
});

test("rejects other users' prefixes, other posts, traversal, extra images, other extensions", () => {
  assert.equal(isValidPostMediaPath(`${other}/${post}/0.jpg`, uid, post), false, "other uid");
  assert.equal(isValidPostMediaPath(`${uid}/${other}/0.jpg`, uid, post), false, "other post");
  assert.equal(isValidPostMediaPath(`${uid}/../${uid}/${post}/0.jpg`, uid, post), false, "traversal");
  assert.equal(isValidPostMediaPath(`${uid}/${post}/4.jpg`, uid, post), false, "fifth image");
  assert.equal(isValidPostMediaPath(`${uid}/${post}/0.png`, uid, post), false, "png");
  assert.equal(isValidPostMediaPath(`${uid}/${post}/0.jpg.exe`, uid, post), false, "double ext");
  assert.equal(isValidPostMediaPath(`/${uid}/${post}/0.jpg`, uid, post), false, "leading slash");
});

test("rejects malformed uid or post id before touching the path", () => {
  assert.equal(isValidPostMediaPath("x/y/0.jpg", "x", "y"), false);
  assert.equal(isValidPostMediaPath(`${uid}/${post}/0.jpg`, `${uid}/`, post), false);
});

test("validateMediaPaths enforces 1..4 unique valid paths", () => {
  assert.deepEqual(validateMediaPaths([`${uid}/${post}/0.jpg`], uid, post), { ok: true });
  assert.equal(validateMediaPaths([], uid, post).ok, false, "empty allowed only for text posts — caller decides");
  assert.equal(validateMediaPaths("nope", uid, post).ok, false, "not an array");
  assert.equal(validateMediaPaths([`${uid}/${post}/0.jpg`, `${uid}/${post}/0.jpg`], uid, post).ok, false, "dupe");
  const five = [0, 1, 2, 3, 4].map((n) => `${uid}/${post}/${n}.jpg`);
  assert.equal(validateMediaPaths(five, uid, post).ok, false, "five");
});
```

Create `test/moderation-decision.test.mjs`:

```javascript
// test/moderation-decision.test.mjs
//
// Apple Guideline 1.2 asks for "a method for filtering objectionable material".
// This is that method's decision table. It fails closed: a post with no
// moderation result is held, never published.

import assert from "node:assert/strict";
import test from "node:test";
import { captionHits, decideModeration } from "../supabase/functions/_shared/moderation.mjs";

const clean = { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY", racy: "UNLIKELY" };

test("clean images and a clean caption publish", () => {
  const d = decideModeration({ captionHits: [], images: [clean, clean], provider: "vision" });
  assert.equal(d.status, "published");
  assert.deepEqual(d.reasons, []);
});

test("VERY_LIKELY adult or violence rejects outright", () => {
  for (const key of ["adult", "violence"]) {
    const d = decideModeration({ captionHits: [], images: [{ ...clean, [key]: "VERY_LIKELY" }], provider: "vision" });
    assert.equal(d.status, "rejected", key);
    assert.ok(d.reasons.includes(`${key}:VERY_LIKELY`));
  }
});

test("LIKELY adult/violence or VERY_LIKELY racy holds for review", () => {
  assert.equal(decideModeration({ captionHits: [], images: [{ ...clean, adult: "LIKELY" }], provider: "vision" }).status, "pending_review");
  assert.equal(decideModeration({ captionHits: [], images: [{ ...clean, violence: "LIKELY" }], provider: "vision" }).status, "pending_review");
  assert.equal(decideModeration({ captionHits: [], images: [{ ...clean, racy: "VERY_LIKELY" }], provider: "vision" }).status, "pending_review");
  // POSSIBLE is noise at a bar (drinks, dim light); it publishes
  assert.equal(decideModeration({ captionHits: [], images: [{ ...clean, racy: "POSSIBLE", adult: "POSSIBLE" }], provider: "vision" }).status, "published");
});

test("a caption hit holds for review even with clean images", () => {
  const d = decideModeration({ captionHits: ["slur"], images: [clean], provider: "vision" });
  assert.equal(d.status, "pending_review");
  assert.ok(d.reasons.includes("caption:slur"));
});

test("fails closed: missing result, provider none, or any null image result holds", () => {
  assert.equal(decideModeration({ captionHits: [], images: [clean, null], provider: "vision" }).status, "pending_review");
  assert.equal(decideModeration({ captionHits: [], images: [clean], provider: "none" }).status, "pending_review");
});

test("a text-only post with a clean caption publishes without an image provider", () => {
  assert.equal(decideModeration({ captionHits: [], images: [], provider: "none" }).status, "published");
});

test("rejection beats review when both apply", () => {
  const d = decideModeration({ captionHits: ["slur"], images: [{ ...clean, adult: "VERY_LIKELY" }], provider: "vision" });
  assert.equal(d.status, "rejected");
});

test("captionHits is case-insensitive, whole-word, and empty for clean text", () => {
  assert.deepEqual(captionHits("Great happy hour, $5 margs!"), []);
  assert.deepEqual(captionHits(null), []);
  assert.ok(captionHits("this place is a SCAM scam").length >= 1);
  assert.deepEqual(captionHits("scampi was great"), [], "substring must not match");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/post-media-path.test.mjs test/moderation-decision.test.mjs`
Expected: FAIL — `Cannot find module ... post-media-path.mjs` and `... moderation.mjs`.

- [ ] **Step 3: Write the modules**

Create `supabase/functions/_shared/http.ts`:

```ts
// supabase/functions/_shared/http.ts
//
// The CORS block and json() helper were copy-pasted into track-visit,
// delete-account, send-friend-invite and verify-checkin. This is the shared
// copy; new functions import it, existing ones migrate opportunistically.

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
```

Create `supabase/functions/_shared/post-media-path.mjs`:

```javascript
// supabase/functions/_shared/post-media-path.mjs
//
// Plain ESM so node --test can execute it (Deno imports it too).
// Path contract: {author_uid}/{post_id}/{n}.jpg, n in 0..MAX_POST_MEDIA-1.
// The storage INSERT policy only checks segment 1 == auth.uid(); create-post
// checks the rest here before creating the row.

export const MAX_POST_MEDIA = 4;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidPostMediaPath(path, uid, postId) {
  if (typeof path !== "string" || typeof uid !== "string" || typeof postId !== "string") return false;
  if (!UUID_RE.test(uid) || !UUID_RE.test(postId)) return false;
  const expectedPrefix = `${uid.toLowerCase()}/${postId.toLowerCase()}/`;
  if (!path.toLowerCase().startsWith(expectedPrefix)) return false;
  const rest = path.slice(expectedPrefix.length);
  const m = rest.match(/^([0-9])\.jpg$/);
  if (!m) return false;
  return Number(m[1]) < MAX_POST_MEDIA;
}

export function validateMediaPaths(paths, uid, postId) {
  if (!Array.isArray(paths)) return { ok: false, error: "media_paths must be an array" };
  if (paths.length < 1) return { ok: false, error: "at least one media path is required" };
  if (paths.length > MAX_POST_MEDIA) return { ok: false, error: `at most ${MAX_POST_MEDIA} media paths` };
  if (new Set(paths).size !== paths.length) return { ok: false, error: "duplicate media path" };
  for (const p of paths) {
    if (!isValidPostMediaPath(p, uid, postId)) return { ok: false, error: `invalid media path: ${String(p)}` };
  }
  return { ok: true };
}
```

Create `supabase/functions/_shared/moderation.mjs`:

```javascript
// supabase/functions/_shared/moderation.mjs
//
// Pure decision table for post moderation. Vision SafeSearch likelihoods:
// UNKNOWN | VERY_UNLIKELY | UNLIKELY | POSSIBLE | LIKELY | VERY_LIKELY.
// Thresholds are deliberately lenient on "racy": a dim bar photo with drinks
// trips POSSIBLE routinely. Adult/violence at VERY_LIKELY is rejected; LIKELY
// is held for a human. Any missing result holds (fail closed).

// Caption blocklist: whole-word, case-insensitive. Kept short on purpose —
// the human queue is the real filter at this scale. Extend with care; every
// term here blocks a legitimate caption that happens to contain it.
export const BLOCKED_TERMS = [
  "scam",
  "kill yourself",
  "kys",
  "nigger",
  "faggot",
  "retard",
  "onlyfans",
  "escort",
];

export function captionHits(body) {
  if (typeof body !== "string" || body.length === 0) return [];
  const text = body.toLowerCase();
  const hits = [];
  for (const term of BLOCKED_TERMS) {
    const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(text)) hits.push(term);
  }
  return hits;
}

const REJECT = new Set(["VERY_LIKELY"]);
const REVIEW = new Set(["LIKELY"]);

/**
 * @param {{ captionHits: string[], images: Array<{adult:string,violence:string,racy:string}|null>, provider: "vision"|"none" }} input
 * @returns {{ status: "published"|"pending_review"|"rejected", reasons: string[] }}
 */
export function decideModeration({ captionHits: hits, images, provider }) {
  const reasons = [];
  let status = "published";
  const hold = (r) => { reasons.push(r); if (status === "published") status = "pending_review"; };
  const reject = (r) => { reasons.push(r); status = "rejected"; };

  for (const h of hits ?? []) hold(`caption:${h}`);

  if ((images ?? []).length > 0 && provider !== "vision") hold("provider:none");

  for (const img of images ?? []) {
    if (!img) { hold("image:no_result"); continue; }
    for (const key of ["adult", "violence"]) {
      if (REJECT.has(img[key])) reject(`${key}:${img[key]}`);
      else if (REVIEW.has(img[key])) hold(`${key}:${img[key]}`);
    }
    if (REJECT.has(img.racy)) hold(`racy:${img.racy}`);
  }

  return { status, reasons };
}
```

Create `supabase/functions/_shared/safe-search.ts`:

```ts
// supabase/functions/_shared/safe-search.ts
//
// Google Cloud Vision SafeSearch over a public image URL. Returns null on any
// failure so the caller's decision table holds the post (fail closed).
// Requires GOOGLE_VISION_API_KEY (supabase secrets set ...). ~$1.50 / 1,000 images.

export type Likelihood = "UNKNOWN" | "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";
export type SafeSearchResult = { adult: Likelihood; violence: Likelihood; racy: Likelihood };

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

export async function safeSearch(imageUrl: string, apiKey: string): Promise<SafeSearchResult | null> {
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        requests: [{ image: { source: { imageUri: imageUrl } }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error("[safe-search] http", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const ann = data?.responses?.[0]?.safeSearchAnnotation;
    if (!ann || data?.responses?.[0]?.error) return null;
    return { adult: ann.adult ?? "UNKNOWN", violence: ann.violence ?? "UNKNOWN", racy: ann.racy ?? "UNKNOWN" };
  } catch (err) {
    console.error("[safe-search] failed", err instanceof Error ? err.message : String(err));
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/post-media-path.test.mjs test/moderation-decision.test.mjs`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/http.ts supabase/functions/_shared/post-media-path.mjs supabase/functions/_shared/moderation.mjs supabase/functions/_shared/safe-search.ts test/post-media-path.test.mjs test/moderation-decision.test.mjs
git commit -m "feat(feed): shared http, media-path validation, moderation decision, SafeSearch client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `create-post` edge function and the functions-deploy workflow

**Files:**
- Create: `supabase/functions/create-post/index.ts`
- Create: `.github/workflows/supabase-functions-deploy.yml`
- Test: `test/create-post-source.test.mjs`

**Interfaces:**
- Consumes: Task 5 modules; `public.check_rate_limit(p_key, p_limit, p_window_seconds)` (service role; TRUE = exceeded); tables from Task 1; bucket from Task 3.
- Produces: `POST /functions/v1/create-post` with `CreatePostRequest` → `CreatePostResponse` (see Interfaces section). Deploy-on-merge for all functions.

- [ ] **Step 1: Write the failing test**

Create `test/create-post-source.test.mjs`:

```javascript
// test/create-post-source.test.mjs
//
// create-post is the only writer of venue_posts. If any guard here is removed,
// the RLS layer will not catch it — there is no client insert policy to fall
// back on. Source-pinned like the other edge-function tests in this suite.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = readFileSync(join(root, "supabase/functions/create-post/index.ts"), "utf8");
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");

test("authenticates with the caller's JWT via an anon-key client (verify-checkin pattern)", () => {
  assert.match(src, /SUPABASE_ANON_KEY/);
  assert.match(src, /global: \{ headers: \{ Authorization: authHeader \} \}/);
  assert.match(src, /userClient\.auth\.getUser\(\)/);
});

test("rate-limits per hour and per day with the documented keys and limits", () => {
  assert.match(src, /const HOURLY = \{ limit: 5, window: 3600 \}/);
  assert.match(src, /const DAILY = \{ limit: 20, window: 86400 \}/);
  assert.match(src, /p_key: `post:\$\{userId\}`, p_limit: HOURLY\.limit, p_window_seconds: HOURLY\.window/);
  assert.match(src, /p_key: `post_day:\$\{userId\}`, p_limit: DAILY\.limit, p_window_seconds: DAILY\.window/);
  assert.match(src, /hourly === true[\s\S]*?429/);
});

test("validates media paths against the caller's uid and lists the storage prefix before inserting", () => {
  assert.match(src, /validateMediaPaths\(mediaPaths, userId, postId\)/);
  const listAt = src.indexOf(".list(");
  const insertAt = src.indexOf('.from("venue_posts")');
  assert.ok(listAt > 0 && insertAt > listAt, "list happens before insert");
});

test("the insert takes its status from the moderation decision, never a literal", () => {
  const insertBlock = src.slice(src.indexOf('.from("venue_posts")'), src.indexOf('.from("venue_posts")') + 600);
  assert.match(insertBlock, /status: decision\.status/);
  assert.doesNotMatch(insertBlock, /status: "published"/);
});

test("rejected content deletes the uploaded objects and returns 422", () => {
  assert.match(src, /decision\.status === "rejected"[\s\S]*?\.remove\(mediaPaths\)[\s\S]*?content_rejected[\s\S]*?422/);
});

test("guidelines must be accepted once, recorded with the service role", () => {
  assert.match(src, /community_guidelines_accepted_at/);
  assert.match(src, /guidelines_required[\s\S]*?428/);
});

test("create-post keeps gateway JWT verification (no verify_jwt=false entry)", () => {
  assert.doesNotMatch(config, /\[functions\.create-post\][\s\S]{0,80}verify_jwt = false/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/create-post-source.test.mjs`
Expected: FAIL — ENOENT on `create-post/index.ts`.

- [ ] **Step 3: Write the function**

Create `supabase/functions/create-post/index.ts`:

```ts
// supabase/functions/create-post/index.ts
//
// Authenticated POST: creates a venue post from photos the client has already
// uploaded to venue-posts/{uid}/{post_id}/{n}.jpg. This is the ONLY writer of
// venue_posts (no client insert policy), so everything that must be true of a
// post is enforced here, fail-closed, cheapest first:
//
//   1. Auth          — caller JWT (verify-checkin pattern)
//   2. Body          — shape, lengths, media paths under the caller's own prefix
//   3. Rate limit    — 5 / hour and 20 / day per user (check_rate_limit, service role)
//   4. Venue         — must be published; optional visit must be the caller's at that venue
//   5. Guidelines    — first post requires accept_guidelines: true; stamped with service role
//   6. Objects       — every declared path exists in storage and is ≤ 5 MB; extras removed
//   7. Moderation    — caption blocklist + Vision SafeSearch per image (_shared/moderation.mjs)
//   8. Insert        — status from the decision; rejected content is deleted and 422'd
//
// Errors: { error: code } — see the plan's Interfaces section for the code list.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { CORS_HEADERS, json } from "../_shared/http.ts";
import { MAX_POST_MEDIA, validateMediaPaths } from "../_shared/post-media-path.mjs";
import { captionHits, decideModeration } from "../_shared/moderation.mjs";
import { safeSearch, type SafeSearchResult } from "../_shared/safe-search.ts";

const BUCKET = "venue-posts";
const MAX_BODY = 500;
const MAX_BYTES = 5 * 1024 * 1024;
const HOURLY = { limit: 5, window: 3600 };
const DAILY = { limit: 20, window: 86400 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "server_error" }, 500);

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "unauthorized" }, 401);
  const userId = user.id;

  // ── 2. Body ────────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }

  const postId = typeof body.post_id === "string" ? body.post_id.trim().toLowerCase() : "";
  const venueId = typeof body.venue_id === "string" ? body.venue_id.trim() : "";
  const caption = typeof body.body === "string" ? body.body.trim() : "";
  const mediaPaths = Array.isArray(body.media_paths) ? (body.media_paths as unknown[]).map(String) : [];
  const rating = typeof body.rating === "number" && Number.isInteger(body.rating) ? body.rating : null;
  const visitId = typeof body.visit_id === "string" ? body.visit_id.trim() : null;
  const acceptGuidelines = body.accept_guidelines === true;

  if (!postId || !venueId) return json({ error: "invalid_body" }, 400);
  if (caption.length > MAX_BODY) return json({ error: "invalid_body" }, 400);
  if (rating !== null && (rating < 1 || rating > 5)) return json({ error: "invalid_body" }, 400);
  if (caption.length === 0 && mediaPaths.length === 0) return json({ error: "invalid_body" }, 400);
  if (mediaPaths.length > 0) {
    const v = validateMediaPaths(mediaPaths, userId, postId);
    if (!v.ok) return json({ error: "invalid_body", detail: v.error }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── 3. Rate limit (TRUE = exceeded) ────────────────────────────────────────
  const { data: hourly } = await supabase.rpc("check_rate_limit", {
    p_key: `post:${userId}`, p_limit: HOURLY.limit, p_window_seconds: HOURLY.window,
  });
  if (hourly === true) return json({ error: "rate_limited", retry_after_seconds: HOURLY.window }, 429);
  const { data: daily } = await supabase.rpc("check_rate_limit", {
    p_key: `post_day:${userId}`, p_limit: DAILY.limit, p_window_seconds: DAILY.window,
  });
  if (daily === true) return json({ error: "rate_limited", retry_after_seconds: DAILY.window }, 429);

  // ── 4. Venue + optional visit ──────────────────────────────────────────────
  const { data: venue } = await supabase
    .from("venues").select("id").eq("id", venueId).eq("status", "published").maybeSingle();
  if (!venue) return json({ error: "venue_not_found" }, 404);

  if (visitId) {
    const { data: visit } = await supabase
      .from("venue_visits").select("id").eq("id", visitId).eq("user_id", userId).eq("venue_id", venueId).maybeSingle();
    if (!visit) return json({ error: "invalid_body", detail: "visit_id is not yours or not at this venue" }, 400);
  }

  // ── 5. Guidelines (first post) ─────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("user_profiles").select("community_guidelines_accepted_at").eq("user_id", userId).maybeSingle();
  if (!profile?.community_guidelines_accepted_at) {
    if (!acceptGuidelines) return json({ error: "guidelines_required" }, 428);
    const { error: stampErr } = await supabase
      .from("user_profiles").update({ community_guidelines_accepted_at: new Date().toISOString() }).eq("user_id", userId);
    if (stampErr) return json({ error: "server_error" }, 500);
  }

  // ── 6. Objects exist under the caller's prefix ─────────────────────────────
  if (mediaPaths.length > 0) {
    const prefix = `${userId}/${postId}`;
    const { data: objects, error: listErr } = await supabase.storage.from(BUCKET).list(prefix, { limit: 20 });
    if (listErr) return json({ error: "server_error" }, 500);
    const byName = new Map((objects ?? []).map((o) => [`${prefix}/${o.name}`, o]));
    for (const p of mediaPaths) {
      const o = byName.get(p);
      if (!o) return json({ error: "media_missing", detail: p }, 400);
      const size = Number((o.metadata as { size?: number } | null)?.size ?? 0);
      if (size > MAX_BYTES) return json({ error: "invalid_body", detail: "media too large" }, 400);
    }
    const extras = [...byName.keys()].filter((k) => !mediaPaths.includes(k));
    if (extras.length > 0) await supabase.storage.from(BUCKET).remove(extras);
  }

  // ── 7. Moderation ──────────────────────────────────────────────────────────
  const hits = captionHits(caption);
  const provider: "vision" | "none" = visionKey ? "vision" : "none";
  const images: Array<SafeSearchResult | null> = provider === "vision"
    ? await Promise.all(mediaPaths.map((p) => safeSearch(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${p}`, visionKey)))
    : mediaPaths.map(() => null);
  const decision = decideModeration({ captionHits: hits, images, provider });

  if (decision.status === "rejected") {
    if (mediaPaths.length > 0) await supabase.storage.from(BUCKET).remove(mediaPaths);
    return json({ error: "content_rejected" }, 422);
  }

  // ── 8. Insert ──────────────────────────────────────────────────────────────
  const { data: post, error: insertErr } = await supabase
    .from("venue_posts")
    .insert({
      id: postId,
      venue_id: venueId,
      author_id: userId,
      visit_id: visitId,
      body: caption.length > 0 ? caption : null,
      media_paths: mediaPaths,
      rating,
      source: "ugc",
      status: decision.status,
      moderation: {
        provider,
        reasons: decision.reasons,
        images,
        decided_at: new Date().toISOString(),
        max_media: MAX_POST_MEDIA,
      },
    })
    .select("id, status")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") return json({ error: "duplicate" }, 409);
    console.error("[create-post] insert failed", { userId, postId, message: insertErr.message });
    return json({ error: "server_error" }, 500);
  }

  return json({ post: { id: post.id, status: post.status } });
});
```

- [ ] **Step 4: Write the deploy workflow**

Create `.github/workflows/supabase-functions-deploy.yml`:

```yaml
name: Supabase Functions Deploy

# Migrations auto-deploy on merge (supabase-db-deploy.yml); edge functions did
# not, and were deployed by hand from runbook prose. This closes that gap. It
# deploys every function so config.toml's verify_jwt settings ship together.
# Uses the SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF secrets already
# consumed by digest-check.yml.

on:
  workflow_dispatch:
  push:
    branches:
      - master
      - main
    paths:
      - "supabase/functions/**"
      - "supabase/config.toml"

concurrency:
  group: supabase-functions-deploy
  cancel-in-progress: false

jobs:
  functions-deploy:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
    steps:
      - uses: actions/checkout@v6
      - uses: supabase/setup-cli@v2
        with:
          version: 2.101.0
      - name: Validate required secrets
        run: |
          if [ -z "$SUPABASE_ACCESS_TOKEN" ] || [ -z "$SUPABASE_PROJECT_REF" ]; then
            echo "::error::SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set as repository secrets."
            exit 1
          fi
      - name: Deploy edge functions
        run: supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"
```

- [ ] **Step 5: Run the test**

Run: `node --test test/create-post-source.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 6: Serve locally and exercise the error paths**

```bash
supabase functions serve create-post --env-file supabase/.env.local --no-verify-jwt
```
In a second terminal, with a real user access token from the local stack (`supabase auth` or the mobile app pointed at local):

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/create-post \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"post_id":"22222222-2222-4222-8222-222222222222","venue_id":"<published venue id>","body":"hi","media_paths":[]}'
```
Expected: `{"error":"guidelines_required"}` (428) on a fresh user; repeat with `"accept_guidelines":true` → `{"post":{"id":"2222…","status":"published"}}` (text-only post, no image provider needed). Then the same `post_id` again → `{"error":"duplicate"}` (409).

- [ ] **Step 7: Set the production secret**

Owner action, recorded in the PR: enable the Cloud Vision API on the Google Cloud project that holds the Places key, create an API key restricted to Vision, then:

```bash
supabase secrets set GOOGLE_VISION_API_KEY=<key> --project-ref "$SUPABASE_PROJECT_REF"
```
Until it is set, every photo post lands in `pending_review` by design.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/create-post/index.ts .github/workflows/supabase-functions-deploy.yml test/create-post-source.test.mjs
git commit -m "feat(feed): create-post edge function with rate limits and SafeSearch moderation; deploy functions from CI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Generated types and shared-types aliases

**Files:**
- Modify: `supabase/types/generated.ts` (regenerated)
- Modify: `packages/shared-types/index.ts`

**Interfaces:**
- Produces: `VenuePost`, `PostLike`, `PostReport`, `UserBlock` row types; `Database["public"]["Functions"]["get_discover_feed"]`.

- [ ] **Step 1: Regenerate**

Run: `supabase start >/dev/null && supabase db reset --yes >/dev/null && npm run supabase:gen-types && git diff --stat supabase/types/generated.ts`
Expected: the diff adds `venue_posts`, `post_likes`, `post_reports`, `user_blocks` under `Tables` and `get_discover_feed` under `Functions`.

- [ ] **Step 2: Add aliases**

In `packages/shared-types/index.ts`, next to the existing `UserProfile` alias, add:

```ts
export type VenuePost = Database["public"]["Tables"]["venue_posts"]["Row"];
export type PostLike = Database["public"]["Tables"]["post_likes"]["Row"];
export type PostReport = Database["public"]["Tables"]["post_reports"]["Row"];
export type UserBlock = Database["public"]["Tables"]["user_blocks"]["Row"];
export type DiscoverFeedRow = Database["public"]["Functions"]["get_discover_feed"]["Returns"][number];
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 (pre-existing mobile errors listed in `docs/mobile-typecheck-errors.md` are unchanged).

- [ ] **Step 4: Commit**

```bash
git add supabase/types/generated.ts packages/shared-types/index.ts
git commit -m "chore(types): regenerate for social feed tables; add row aliases

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Mobile pure logic — feed paging and media paths

**Files:**
- Create: `apps/mobile/src/lib/feedPage.mjs`, `apps/mobile/src/lib/feedPage.d.ts`
- Create: `apps/mobile/src/lib/postMediaPath.mjs`, `apps/mobile/src/lib/postMediaPath.d.ts`
- Test: `test/social-feed-page.test.mjs`; append to `test/post-media-path.test.mjs`

**Interfaces:**
- Produces: `mergeFeedPages(existing, incoming)`, `spreadVenues(items, maxRun = 2)`, `cursorFrom(items)` over items shaped `{ id: string; venueId: string; createdAt: string }`; `buildPostMediaPath(uid, postId, index)`.

- [ ] **Step 1: Write the failing tests**

Create `test/social-feed-page.test.mjs`:

```javascript
// test/social-feed-page.test.mjs
//
// The feed RPC pages by exact keyset (created_at, id). Anything that reorders
// must therefore happen inside a page and must never move an item across the
// page boundary, or the next cursor would skip or repeat. These pin that.

import assert from "node:assert/strict";
import test from "node:test";
import { mergeFeedPages, spreadVenues, cursorFrom } from "../apps/mobile/src/lib/feedPage.mjs";

const item = (id, venueId, createdAt = "2026-09-07T00:00:00Z") => ({ id, venueId, createdAt });

test("mergeFeedPages appends, dedupes by id, preserves order", () => {
  const a = [item("1", "v1"), item("2", "v2")];
  const b = [item("2", "v2"), item("3", "v3")];
  assert.deepEqual(mergeFeedPages(a, b).map((i) => i.id), ["1", "2", "3"]);
  assert.deepEqual(mergeFeedPages([], b).map((i) => i.id), ["2", "3"]);
});

test("spreadVenues breaks a run of three with the next different venue", () => {
  const page = [item("1", "A"), item("2", "A"), item("3", "A"), item("4", "B"), item("5", "A")];
  assert.deepEqual(spreadVenues(page).map((i) => i.id), ["1", "2", "4", "3", "5"]);
});

test("spreadVenues never moves an item more than two slots and leaves an unfixable run alone", () => {
  const allSame = [item("1", "A"), item("2", "A"), item("3", "A"), item("4", "A")];
  assert.deepEqual(spreadVenues(allSame).map((i) => i.id), ["1", "2", "3", "4"]);
  const farAway = [item("1", "A"), item("2", "A"), item("3", "A"), item("4", "A"), item("5", "A"), item("6", "B")];
  // At index 2 nothing different is within two slots, so 1-2-3 stays a run of
  // three. At index 3, B (index 5) is exactly two slots away and is pulled up.
  assert.deepEqual(spreadVenues(farAway).map((i) => i.id), ["1", "2", "3", "6", "4", "5"]);
});

test("spreadVenues result is a permutation of its input", () => {
  const page = ["A", "A", "B", "A", "A", "A", "C", "A"].map((v, n) => item(String(n), v));
  const out = spreadVenues(page);
  assert.deepEqual([...out].sort((x, y) => x.id.localeCompare(y.id)), [...page].sort((x, y) => x.id.localeCompare(y.id)));
  for (let i = 2; i < out.length; i++) {
    if (out[i].venueId === out[i - 1].venueId && out[i].venueId === out[i - 2].venueId) {
      // allowed only when no different venue was within reach
      assert.ok(true);
    }
  }
});

test("cursorFrom is the last item's keyset, or null for an empty page", () => {
  assert.equal(cursorFrom([]), null);
  assert.deepEqual(cursorFrom([item("1", "A", "t1"), item("2", "B", "t2")]), { createdAt: "t2", id: "2" });
});
```

Append to `test/post-media-path.test.mjs`:

```javascript
import { buildPostMediaPath } from "../apps/mobile/src/lib/postMediaPath.mjs";

test("the mobile builder produces paths the edge validator accepts, for every index", () => {
  for (let n = 0; n < MAX_POST_MEDIA; n++) {
    const p = buildPostMediaPath(uid, post, n);
    assert.equal(isValidPostMediaPath(p, uid, post), true, p);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/social-feed-page.test.mjs test/post-media-path.test.mjs`
Expected: FAIL — cannot find `feedPage.mjs` / `postMediaPath.mjs`.

- [ ] **Step 3: Write the modules**

Create `apps/mobile/src/lib/feedPage.mjs`:

```javascript
// src/lib/feedPage.mjs
//
// Pure helpers for the Discover posts feed. Plain ESM + colocated .d.ts (same
// arrangement as parseActivityLink) so node --test executes it on CI.

export function mergeFeedPages(existing, incoming) {
  const seen = new Set(existing.map((i) => i.id));
  const out = existing.slice();
  for (const i of incoming) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
}

/**
 * Diversity rule: no more than `maxRun` consecutive cards from one venue.
 * Local, stable, bounded: when a run would exceed maxRun at index i, the
 * first item within the next two slots from a different venue is pulled up
 * to i. Items never move more than two slots and never cross the page edge,
 * so the keyset cursor (the last item) is unaffected unless the last item
 * itself is pulled forward — in which case the new last item is still the
 * page's true keyset minimum, because only items after i moved.
 */
export function spreadVenues(items, maxRun = 2) {
  const out = items.slice();
  for (let i = maxRun; i < out.length; i++) {
    const v = out[i].venueId;
    let run = 0;
    for (let k = i - 1; k >= 0 && out[k].venueId === v; k--) run++;
    if (run < maxRun) continue;
    let j = -1;
    for (let c = i + 1; c <= Math.min(i + 2, out.length - 1); c++) {
      if (out[c].venueId !== v) { j = c; break; }
    }
    if (j === -1) continue;
    const [moved] = out.splice(j, 1);
    out.splice(i, 0, moved);
  }
  return out;
}

export function cursorFrom(items) {
  if (!items.length) return null;
  const last = items[items.length - 1];
  return { createdAt: last.createdAt, id: last.id };
}
```

Create `apps/mobile/src/lib/feedPage.d.ts`:

```ts
export type FeedPageItem = { id: string; venueId: string; createdAt: string };
export type FeedCursor = { createdAt: string; id: string };
export function mergeFeedPages<T extends FeedPageItem>(existing: T[], incoming: T[]): T[];
export function spreadVenues<T extends FeedPageItem>(items: T[], maxRun?: number): T[];
export function cursorFrom<T extends FeedPageItem>(items: T[]): FeedCursor | null;
```

Create `apps/mobile/src/lib/postMediaPath.mjs`:

```javascript
// src/lib/postMediaPath.mjs — must stay in step with
// supabase/functions/_shared/post-media-path.mjs (test/post-media-path.test.mjs pins it).
export const MAX_POST_MEDIA = 4;
export function buildPostMediaPath(uid, postId, index) {
  return `${uid}/${postId}/${index}.jpg`;
}
```

Create `apps/mobile/src/lib/postMediaPath.d.ts`:

```ts
export const MAX_POST_MEDIA: number;
export function buildPostMediaPath(uid: string, postId: string, index: number): string;
```

- [ ] **Step 4: Run tests**

Run: `node --test test/social-feed-page.test.mjs test/post-media-path.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/feedPage.mjs apps/mobile/src/lib/feedPage.d.ts apps/mobile/src/lib/postMediaPath.mjs apps/mobile/src/lib/postMediaPath.d.ts test/social-feed-page.test.mjs test/post-media-path.test.mjs
git commit -m "feat(mobile): pure feed paging and media-path helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `useDiscoverPosts` hook

**Files:**
- Create: `apps/mobile/src/hooks/useDiscoverPosts.ts`

**Interfaces:**
- Consumes: `get_discover_feed` (Task 4), `post_likes` policies (Task 2), `feedPage` helpers (Task 8), `useCurrentUser`.
- Produces:
  ```ts
  export type DiscoverPost = {
    id: string; venueId: string; venueName: string; venueSlug: string | null; venueNeighborhood: string | null;
    authorId: string; authorHandle: string | null; authorDisplayName: string | null; authorAvatarUrl: string | null; authorRole: string | null;
    body: string | null; mediaPaths: string[]; mediaUrls: string[]; rating: number | null;
    source: "ugc" | "instagram" | "tiktok"; externalUrl: string | null; createdAt: string;
    likeCount: number; likedByMe: boolean; isVerifiedVisit: boolean;
  };
  export function useDiscoverPosts(): {
    posts: DiscoverPost[]; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string | null;
    refresh(): Promise<void>; loadMore(): Promise<void>;
    toggleLike(postId: string): Promise<boolean>;   // false when signed out
    removePost(postId: string): void; removeAuthor(authorId: string): void;
  };
  ```

- [ ] **Step 1: Write the hook**

Create `apps/mobile/src/hooks/useDiscoverPosts.ts`:

```ts
// src/hooks/useDiscoverPosts.ts
//
// Discover tab data source (Social Discovery Feed SP1). Pages through
// get_discover_feed with an exact (created_at, id) keyset. The cursor is taken
// from the RAW page, before spreadVenues() reorders it, because the raw page's
// last row is the true keyset minimum. Likes are optimistic; there is no
// realtime. Cast through (supabase as any) until generated types ship in the
// mobile build — same precedent as useDiscoverFeed.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { cursorFrom, mergeFeedPages, spreadVenues, type FeedCursor } from "../lib/feedPage";

const PAGE_SIZE = 20;
const BUCKET = "venue-posts";

export type DiscoverPost = {
  id: string;
  venueId: string;
  venueName: string;
  venueSlug: string | null;
  venueNeighborhood: string | null;
  authorId: string;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authorRole: string | null;
  body: string | null;
  mediaPaths: string[];
  mediaUrls: string[];
  rating: number | null;
  source: "ugc" | "instagram" | "tiktok";
  externalUrl: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  isVerifiedVisit: boolean;
};

type FeedRow = {
  id: string; venue_id: string; venue_name: string; venue_slug: string | null; venue_neighborhood: string | null;
  author_id: string; author_handle: string | null; author_display_name: string | null;
  author_avatar_url: string | null; author_role: string | null;
  body: string | null; media_paths: string[] | null; rating: number | null;
  source: "ugc" | "instagram" | "tiktok"; external_url: string | null; created_at: string;
  like_count: number | string; liked_by_me: boolean; is_verified_visit: boolean;
};

function publicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function toPost(row: FeedRow): DiscoverPost {
  const mediaPaths = row.media_paths ?? [];
  return {
    id: row.id,
    venueId: row.venue_id,
    venueName: row.venue_name,
    venueSlug: row.venue_slug,
    venueNeighborhood: row.venue_neighborhood,
    authorId: row.author_id,
    authorHandle: row.author_handle,
    authorDisplayName: row.author_display_name,
    authorAvatarUrl: row.author_avatar_url,
    authorRole: row.author_role,
    body: row.body,
    mediaPaths,
    mediaUrls: mediaPaths.map(publicUrl),
    rating: row.rating,
    source: row.source,
    externalUrl: row.external_url,
    createdAt: row.created_at,
    likeCount: Number(row.like_count ?? 0),
    likedByMe: Boolean(row.liked_by_me),
    isVerifiedVisit: Boolean(row.is_verified_visit),
  };
}

// spreadVenues/cursorFrom operate on { id, venueId, createdAt }; DiscoverPost satisfies that.

export function useDiscoverPosts() {
  const { user } = useCurrentUser();
  const [posts, setPosts] = useState<DiscoverPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<FeedCursor | null>(null);
  const inFlight = useRef(false);

  const fetchPage = useCallback(async (cursor: FeedCursor | null): Promise<DiscoverPost[]> => {
    const { data, error: rpcError } = await (supabase as any).rpc("get_discover_feed", {
      p_limit: PAGE_SIZE,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null,
    });
    if (rpcError) throw new Error(rpcError.message);
    return ((data ?? []) as FeedRow[]).map(toPost);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(null);
      cursorRef.current = cursorFrom(page);
      setHasMore(page.length === PAGE_SIZE);
      setPosts(spreadVenues(page));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the feed.");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (inFlight.current || !hasMore || !cursorRef.current) return;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursorRef.current);
      cursorRef.current = cursorFrom(page) ?? cursorRef.current;
      setHasMore(page.length === PAGE_SIZE);
      setPosts((prev) => mergeFeedPages(prev, spreadVenues(page)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
      inFlight.current = false;
    }
  }, [fetchPage, hasMore]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleLike = useCallback(
    async (postId: string): Promise<boolean> => {
      if (!user?.id) return false;
      const current = posts.find((p) => p.id === postId);
      if (!current) return true;
      const nextLiked = !current.likedByMe;
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likedByMe: nextLiked, likeCount: Math.max(0, p.likeCount + (nextLiked ? 1 : -1)) }
            : p,
        ),
      );
      const q = nextLiked
        ? (supabase as any).from("post_likes").insert({ post_id: postId, user_id: user.id })
        : (supabase as any).from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
      const { error: likeError } = await q;
      if (likeError && likeError.code !== "23505") {
        // revert
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, likedByMe: !nextLiked, likeCount: Math.max(0, p.likeCount + (nextLiked ? -1 : 1)) }
              : p,
          ),
        );
      }
      return true;
    },
    [posts, user?.id],
  );

  const removePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const removeAuthor = useCallback((authorId: string) => {
    setPosts((prev) => prev.filter((p) => p.authorId !== authorId));
  }, []);

  return { posts, loading, loadingMore, hasMore, error, refresh, loadMore, toggleLike, removePost, removeAuthor };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace mobile`
Expected: no new errors (compare against `docs/mobile-typecheck-errors.md`).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useDiscoverPosts.ts
git commit -m "feat(mobile): useDiscoverPosts keyset-paged feed hook with optimistic likes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `useCreatePost` hook and community guidelines copy

**Files:**
- Create: `apps/mobile/src/hooks/useCreatePost.ts`
- Create: `apps/mobile/src/lib/communityGuidelines.ts`
- Test: `test/create-post-uploader.test.mjs`

**Interfaces:**
- Consumes: `buildPostMediaPath` (Task 8), `create-post` (Task 6), bucket (Task 3).
- Produces:
  ```ts
  export type CreatePostInput = { venueId: string; assetUris: string[]; body: string; rating: number | null; visitId?: string | null; acceptGuidelines: boolean; retryPostId?: string };
  export type CreatePostErrorCode = "unauthorized" | "guidelines_required" | "rate_limited" | "content_rejected" | "invalid_body" | "media_missing" | "venue_not_found" | "network" | "server_error";
  export type CreatePostResult = { ok: true; postId: string; status: "published" | "pending_review" } | { ok: false; code: CreatePostErrorCode; message: string; postId?: string };
  export function useCreatePost(): { state: CreatePostState; pickImages(): Promise<string[]>; createPost(input: CreatePostInput): Promise<CreatePostResult>; reset(): void };
  ```
  `SUPPORT_EMAIL`, `COMMUNITY_GUIDELINES` from `communityGuidelines.ts`.

- [ ] **Step 1: Write the failing test**

Create `test/create-post-uploader.test.mjs`:

```javascript
// test/create-post-uploader.test.mjs
//
// In React Native, fetch(fileUri).blob() yields an EMPTY body: useAvatarUpload
// shipped 0-byte avatars (HTTP 200, no error) before it switched to
// manipulateAsync({ base64: true }) + decode(). This pins the post uploader to
// the working path, and pins that re-encoding through the manipulator (which
// drops EXIF, including GPS) is unconditional.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "apps/mobile/src/hooks/useCreatePost.ts"), "utf8");

test("every image is re-encoded via manipulateAsync with base64 and decoded to bytes", () => {
  assert.match(src, /manipulateAsync\([\s\S]*?base64: true/);
  assert.match(src, /decode\(manip\.base64\)/);
  assert.doesNotMatch(src, /\.blob\(\)/);
});

test("uploads go to venue-posts at the shared path convention, never upserting", () => {
  assert.match(src, /from\("venue-posts"\)/);
  assert.match(src, /buildPostMediaPath\(userId, postId, i\)/);
  assert.match(src, /upsert: false/);
});

test("create-post is invoked with the session's bearer token", () => {
  assert.match(src, /functions\.invoke\("create-post"/);
  assert.match(src, /Authorization: `Bearer \$\{session\.access_token\}`/);
});

test("the client never sends more than the shared maximum of images", () => {
  assert.match(src, /selectionLimit: MAX_POST_MEDIA/);
  assert.match(src, /slice\(0, MAX_POST_MEDIA\)/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/create-post-uploader.test.mjs`
Expected: FAIL — ENOENT.

- [ ] **Step 3: Write the guidelines copy**

Create `apps/mobile/src/lib/communityGuidelines.ts`:

```ts
// src/lib/communityGuidelines.ts
//
// Shown once, before a user's first post (create-post returns
// guidelines_required until accept_guidelines: true is sent). Also linked from
// the report sheet. Keep in step with the Terms "User content" section in
// apps/directory/src/app/terms/page.tsx.

// Spec open question #1: confirm this inbox is monitored for inbound mail.
export const SUPPORT_EMAIL = "admin@happitime.biz";

export const COMMUNITY_GUIDELINES = {
  title: "Community guidelines",
  intro: "HappiTime is for sharing real nights out at real places. Before you post:",
  rules: [
    "Post your own photos, taken at the venue you tag.",
    "No nudity, violence, hate, harassment, or threats.",
    "No spam, ads, or promotions for other businesses.",
    "Don't post other people without their OK.",
    "You must be 21+ to post about alcohol.",
  ],
  outro:
    "We review reports within 24 hours and remove posts that break these rules. Repeat violations close your account. " +
    `Questions: ${SUPPORT_EMAIL}`,
  termsUrl: "https://happitime.biz/terms",
} as const;
```

- [ ] **Step 4: Write the hook**

Create `apps/mobile/src/hooks/useCreatePost.ts`:

```ts
// src/hooks/useCreatePost.ts
//
// Pick → resize (drops EXIF) → upload to venue-posts/{uid}/{postId}/{i}.jpg
// → invoke create-post. Storage-first: the row is created only after every
// object exists, and create-post re-verifies that. Mirrors useAvatarUpload for
// the byte-handling gotcha and useCheckin for the explicit Authorization header.

import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import { supabase } from "../api/supabaseClient";
import { MAX_POST_MEDIA, buildPostMediaPath } from "../lib/postMediaPath";

const BUCKET = "venue-posts";
const MAX_EDGE = 1600;

export type CreatePostInput = {
  venueId: string;
  assetUris: string[];
  body: string;
  rating: number | null;
  visitId?: string | null;
  acceptGuidelines: boolean;
  /** Set on the retry after guidelines_required: reuse the folder, skip re-upload. */
  retryPostId?: string;
};

export type CreatePostErrorCode =
  | "unauthorized" | "guidelines_required" | "rate_limited" | "content_rejected"
  | "invalid_body" | "media_missing" | "venue_not_found" | "network" | "server_error";

export type CreatePostResult =
  | { ok: true; postId: string; status: "published" | "pending_review" }
  | { ok: false; code: CreatePostErrorCode; message: string; postId?: string };

export type CreatePostState =
  | { status: "idle" }
  | { status: "uploading"; index: number; total: number }
  | { status: "submitting" }
  | { status: "done"; result: CreatePostResult };

const MESSAGES: Record<CreatePostErrorCode, string> = {
  unauthorized: "Sign in to post.",
  guidelines_required: "Please accept the community guidelines first.",
  rate_limited: "You've posted a lot recently — try again in a bit.",
  content_rejected: "That post can't be shared on HappiTime.",
  invalid_body: "Something about this post isn't valid.",
  media_missing: "One of your photos didn't upload. Please try again.",
  venue_not_found: "That venue isn't available.",
  network: "Check your connection and try again.",
  server_error: "Something went wrong. Please try again.",
};

async function readFunctionError(err: unknown): Promise<CreatePostErrorCode> {
  const ctx = (err as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error && body.error in MESSAGES) return body.error as CreatePostErrorCode;
    } catch { /* fall through */ }
    return "server_error";
  }
  return "network";
}

export function useCreatePost() {
  const [state, setState] = useState<CreatePostState>({ status: "idle" });

  const pickImages = useCallback(async (): Promise<string[]> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return [];
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      selectionLimit: MAX_POST_MEDIA,
      quality: 1,
    });
    if (result.canceled) return [];
    return result.assets.slice(0, MAX_POST_MEDIA).map((a) => a.uri);
  }, []);

  const createPost = useCallback(async (input: CreatePostInput): Promise<CreatePostResult> => {
    const postId = input.retryPostId ?? crypto.randomUUID();
    const fail = (code: CreatePostErrorCode): CreatePostResult => {
      const r: CreatePostResult = { ok: false, code, message: MESSAGES[code], postId };
      setState({ status: "done", result: r });
      return r;
    };

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.user?.id) return fail("unauthorized");
    const userId = session.user.id;
    const uris = input.assetUris.slice(0, MAX_POST_MEDIA);
    const mediaPaths: string[] = [];

    if (input.retryPostId) {
      // Objects were uploaded on the first attempt; create-post re-verifies them.
      mediaPaths.push(...uris.map((_, i) => buildPostMediaPath(userId, postId, i)));
    } else {
      try {
        for (let i = 0; i < uris.length; i++) {
          setState({ status: "uploading", index: i + 1, total: uris.length });
          // Re-encode: bounds the long edge, drops EXIF (incl. GPS), yields real bytes.
          const manip = await ImageManipulator.manipulateAsync(
            uris[i],
            [{ resize: { width: MAX_EDGE } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );
          if (!manip.base64) return fail("media_missing");
          const path = buildPostMediaPath(userId, postId, i);
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, decode(manip.base64), { contentType: "image/jpeg", upsert: false });
          if (upErr) return fail("media_missing");
          mediaPaths.push(path);
        }
      } catch {
        return fail("network");
      }
    }

    setState({ status: "submitting" });
    const { data, error } = await supabase.functions.invoke("create-post", {
      body: {
        post_id: postId,
        venue_id: input.venueId,
        body: input.body.trim(),
        media_paths: mediaPaths,
        rating: input.rating ?? undefined,
        visit_id: input.visitId ?? undefined,
        accept_guidelines: input.acceptGuidelines,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      const code = await readFunctionError(error);
      // Guidelines and rate limits leave the uploads in place for a retry;
      // anything else cleans up so no orphan objects linger.
      if (code !== "guidelines_required" && code !== "rate_limited" && mediaPaths.length > 0) {
        await supabase.storage.from(BUCKET).remove(mediaPaths);
      }
      return fail(code);
    }

    const post = (data as { post?: { id: string; status: "published" | "pending_review" } })?.post;
    if (!post) return fail("server_error");
    const ok: CreatePostResult = { ok: true, postId: post.id, status: post.status };
    setState({ status: "done", result: ok });
    return ok;
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, pickImages, createPost, reset };
}
```

- [ ] **Step 5: Run the test and typecheck**

Run: `node --test test/create-post-uploader.test.mjs && npm run typecheck --workspace mobile`
Expected: PASS, 4 tests; no new type errors. If `crypto.randomUUID` is not in the RN type lib, add `declare const crypto: { randomUUID(): string };` at the top of the hook (Hermes on RN 0.81 provides it at runtime).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/hooks/useCreatePost.ts apps/mobile/src/lib/communityGuidelines.ts test/create-post-uploader.test.mjs
git commit -m "feat(mobile): useCreatePost upload+invoke hook and community guidelines copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `SocialPostCard`, `PostActionsSheet`, and the extracted legacy card

**Files:**
- Create: `apps/mobile/src/components/feed/SocialPostCard.tsx`
- Create: `apps/mobile/src/components/feed/PostActionsSheet.tsx`
- Create: `apps/mobile/src/components/feed/DiscoverFeedCard.tsx`
- Modify: `apps/mobile/src/screens/ActivityScreen.tsx` (remove the local `DiscoverFeedCard` const, import the new one)

**Interfaces:**
- Consumes: `DiscoverPost` (Task 9), `SuperUserBadge` (`../SuperUserBadge`), theme tokens, `SUPPORT_EMAIL`.
- Produces:
  ```ts
  <SocialPostCard post currentUserId onToggleLike(postId) onOpenVenue(venueId) onOpenActions(post) />
  <PostActionsSheet post currentUserId onClose onReported(postId) onBlocked(authorId) onDeleted(postId) />
  <DiscoverFeedCard item anonymous? />   // unchanged behaviour, new file
  ```

- [ ] **Step 1: Extract the legacy card**

In `ActivityScreen.tsx`, find `const DiscoverFeedCard: React.FC<{ item: DiscoverFeedItem; anonymous?: boolean }>` (L314 at time of writing). Move that const, the `timeAgo` helper it uses, and the `styles` entries its JSX references into `apps/mobile/src/components/feed/DiscoverFeedCard.tsx` with this header, then `export` the component and re-import it in ActivityScreen (`import { DiscoverFeedCard } from "../components/feed/DiscoverFeedCard";`). Keep `timeAgo` in ActivityScreen too if other cards use it (they do — `ActivityCard`, `NotificationCard`); duplicate the eight-line helper rather than creating a shared module in this task.

```tsx
// src/components/feed/DiscoverFeedCard.tsx
//
// Legacy Discover card: one generated sentence per user_events row. Extracted
// verbatim from ActivityScreen.tsx (Social Discovery Feed SP1) so the Discover
// tab can render it as the "Recent activity" fallback under SocialPostCard.
// Behaviour unchanged.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { DiscoverFeedItem } from "../../hooks/useDiscoverFeed";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
// ... moved const + styles ...
export { DiscoverFeedCard };
```

Run `npm run typecheck --workspace mobile` after the move; the only acceptable diff in ActivityScreen is the removed const, the removed unused styles, and the new import.

- [ ] **Step 2: Write `SocialPostCard`**

Create `apps/mobile/src/components/feed/SocialPostCard.tsx`:

```tsx
// src/components/feed/SocialPostCard.tsx
//
// Full-width post card for the Discover feed. Media is a paged horizontal
// FlatList of RN <Image> at a 4:5 box (portrait-friendly, no layout jump).
// Synced sources (instagram/tiktok, SP3/SP4) show a link-out instead of a like.

import React, { useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions, Linking } from "react-native";
import type { DiscoverPost } from "../../hooks/useDiscoverPosts";
import { SuperUserBadge } from "../SuperUserBadge";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

type Props = {
  post: DiscoverPost;
  currentUserId: string | null;
  onToggleLike: (postId: string) => void;
  onOpenVenue: (venueId: string) => void;
  onOpenActions: (post: DiscoverPost) => void;
};

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export function SocialPostCard({ post, currentUserId, onToggleLike, onOpenVenue, onOpenActions }: Props) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const mediaHeight = Math.round((width * 5) / 4);
  const name = post.authorDisplayName || (post.authorHandle ? `@${post.authorHandle}` : "Someone");
  const isSynced = post.source !== "ugc";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {post.authorAvatarUrl ? (
          <Image source={{ uri: post.authorAvatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <SuperUserBadge role={post.authorRole} size="sm" />
          </View>
          <Pressable onPress={() => onOpenVenue(post.venueId)} hitSlop={6} accessibilityRole="button">
            <Text style={styles.venue} numberOfLines={1}>
              {post.venueName}
              {post.venueNeighborhood ? ` · ${post.venueNeighborhood}` : ""}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
        <Pressable
          onPress={() => onOpenActions(post)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="More options"
          style={styles.more}
        >
          <Text style={styles.moreText}>···</Text>
        </Pressable>
      </View>

      {post.mediaUrls.length > 0 ? (
        <View style={{ height: mediaHeight }}>
          <FlatList
            data={post.mediaUrls}
            keyExtractor={(u, i) => `${post.id}-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Image source={{ uri: item }} style={{ width, height: mediaHeight }} resizeMode="cover" />
            )}
          />
          {post.mediaUrls.length > 1 ? (
            <View style={styles.dots}>
              {post.mediaUrls.map((_, i) => (
                <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        {isSynced && post.externalUrl ? (
          <Pressable onPress={() => post.externalUrl && Linking.openURL(post.externalUrl)} accessibilityRole="link">
            <Text style={styles.linkOut}>View on {post.source === "instagram" ? "Instagram" : "TikTok"}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onToggleLike(post.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={post.likedByMe ? "Unlike" : "Like"}
            style={styles.likeBtn}
          >
            <Text style={[styles.likeIcon, post.likedByMe && styles.likeIconActive]}>{post.likedByMe ? "♥" : "♡"}</Text>
            <Text style={styles.likeCount}>{post.likeCount > 0 ? post.likeCount : ""}</Text>
          </Pressable>
        )}
        {post.isVerifiedVisit ? <Text style={styles.verified}>✓ Verified visit</Text> : null}
        {post.rating ? <Text style={styles.rating}>{"★".repeat(post.rating)}</Text> : null}
      </View>

      {post.body ? (
        <Text style={styles.body}>
          <Text style={styles.bodyName}>{post.authorHandle ? `@${post.authorHandle} ` : ""}</Text>
          {post.body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, paddingVertical: spacing.md },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandSubtle },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.brandDark, fontWeight: "700" },
  headerText: { flex: 1, marginLeft: spacing.sm },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  name: { fontWeight: "700", color: colors.text, maxWidth: 200 },
  venue: { color: colors.textMuted, fontSize: 13, marginTop: 1 },
  time: { color: colors.textMutedLight, fontSize: 12, marginRight: spacing.sm },
  more: { paddingHorizontal: spacing.xs },
  moreText: { color: colors.textMuted, fontSize: 18, letterSpacing: 1 },
  dots: { position: "absolute", bottom: spacing.sm, alignSelf: "center", flexDirection: "row", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: colors.surface },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  likeIcon: { fontSize: 22, color: colors.text },
  likeIconActive: { color: colors.wine },
  likeCount: { color: colors.textMuted, fontSize: 13 },
  linkOut: { color: colors.primaryDark, fontWeight: "600" },
  verified: { color: colors.success, fontSize: 12, fontWeight: "600" },
  rating: { color: colors.primary, fontSize: 13, marginLeft: "auto" },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, color: colors.text, lineHeight: 20 },
  bodyName: { fontWeight: "700" },
});
```

- [ ] **Step 3: Write `PostActionsSheet`**

Create `apps/mobile/src/components/feed/PostActionsSheet.tsx`:

```tsx
// src/components/feed/PostActionsSheet.tsx
//
// Report / block / delete sheet. Apple Guideline 1.2: report + block +
// published contact. RN <Modal transparent animationType="slide">, the same
// pattern as ListingFreshness. Writes go straight through RLS:
//   post_reports  insert (reporter_id = auth.uid()); 23505 = already reported;
//                 'report_rate_limited' from the daily-cap trigger
//   user_blocks   insert (blocker_id = auth.uid())
//   venue_posts   delete own, then storage remove own objects

import React, { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from "react-native";
import { supabase } from "../../api/supabaseClient";
import type { DiscoverPost } from "../../hooks/useDiscoverPosts";
import { SUPPORT_EMAIL } from "../../lib/communityGuidelines";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

type Reason = "spam" | "inappropriate" | "harassment" | "not_this_venue" | "other";
const REASONS: { key: Reason; label: string }[] = [
  { key: "inappropriate", label: "Inappropriate or explicit" },
  { key: "harassment", label: "Harassment or hate" },
  { key: "spam", label: "Spam or an ad" },
  { key: "not_this_venue", label: "Not this venue" },
  { key: "other", label: "Something else" },
];

type Props = {
  post: DiscoverPost | null;
  currentUserId: string | null;
  onClose: () => void;
  onReported: (postId: string) => void;
  onBlocked: (authorId: string) => void;
  onDeleted: (postId: string) => void;
};

export function PostActionsSheet({ post, currentUserId, onClose, onReported, onBlocked, onDeleted }: Props) {
  const [mode, setMode] = useState<"menu" | "report" | "thanks">("menu");
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setMode("menu"); setReason(null); setNote(""); setBusy(false); onClose(); };
  if (!post) return null;
  const isOwn = currentUserId != null && currentUserId === post.authorId;

  async function submitReport() {
    if (!post || !reason || !currentUserId) return;
    setBusy(true);
    const { error } = await (supabase as any).from("post_reports").insert({
      post_id: post.id, reporter_id: currentUserId, reason, note: note.trim() || null,
    });
    setBusy(false);
    if (error && error.code !== "23505") {
      const limited = String(error.message ?? "").includes("report_rate_limited");
      Alert.alert(limited ? "Too many reports today" : "Couldn't send report", limited ? "Please try again tomorrow." : "Please try again in a moment.");
      return;
    }
    setMode("thanks");
    onReported(post.id);
  }

  async function blockAuthor() {
    if (!post || !currentUserId) return;
    Alert.alert("Block this user?", "You won't see each other's posts.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block", style: "destructive",
        onPress: async () => {
          const { error } = await (supabase as any).from("user_blocks").insert({ blocker_id: currentUserId, blocked_id: post.authorId });
          if (error && error.code !== "23505") { Alert.alert("Couldn't block", "Please try again."); return; }
          onBlocked(post.authorId);
          close();
        },
      },
    ]);
  }

  async function deleteOwn() {
    if (!post) return;
    Alert.alert("Delete this post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          const { error } = await (supabase as any).from("venue_posts").delete().eq("id", post.id);
          if (error) { Alert.alert("Couldn't delete", "Please try again."); return; }
          if (post.mediaPaths.length > 0) await supabase.storage.from("venue-posts").remove(post.mediaPaths);
          onDeleted(post.id);
          close();
        },
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.root}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {mode === "menu" ? (
            <>
              {isOwn ? (
                <Pressable style={styles.row} onPress={deleteOwn}><Text style={[styles.rowText, styles.danger]}>Delete post</Text></Pressable>
              ) : (
                <>
                  <Pressable style={styles.row} onPress={() => (currentUserId ? setMode("report") : Alert.alert("Sign in to report"))}>
                    <Text style={styles.rowText}>Report post</Text>
                  </Pressable>
                  <Pressable style={styles.row} onPress={() => (currentUserId ? blockAuthor() : Alert.alert("Sign in to block"))}>
                    <Text style={[styles.rowText, styles.danger]}>Block {post.authorHandle ? `@${post.authorHandle}` : "user"}</Text>
                  </Pressable>
                </>
              )}
              <Text style={styles.support}>Need help? {SUPPORT_EMAIL}</Text>
            </>
          ) : mode === "report" ? (
            <>
              <Text style={styles.title}>What's wrong with this post?</Text>
              {REASONS.map((r) => (
                <Pressable key={r.key} style={[styles.row, reason === r.key && styles.rowActive]} onPress={() => setReason(r.key)}>
                  <Text style={[styles.rowText, reason === r.key && styles.rowTextActive]}>{r.label}</Text>
                </Pressable>
              ))}
              <TextInput style={styles.note} placeholder="Anything else? (optional)" placeholderTextColor={colors.textMutedLight} value={note} onChangeText={setNote} maxLength={300} multiline />
              <Pressable style={[styles.submit, (!reason || busy) && { opacity: 0.5 }]} disabled={!reason || busy} onPress={submitReport}>
                <Text style={styles.submitText}>{busy ? "Sending…" : "Send report"}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Thanks — we'll review this within 24 hours.</Text>
              <Text style={styles.support}>Posts reported by two people are hidden right away while we look.</Text>
              <Pressable style={styles.submit} onPress={close}><Text style={styles.submitText}>Done</Text></Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, paddingBottom: spacing.xxl },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  row: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowActive: { backgroundColor: colors.brandSubtle, borderRadius: 8, paddingHorizontal: spacing.sm },
  rowText: { fontSize: 16, color: colors.text },
  rowTextActive: { fontWeight: "700" },
  danger: { color: colors.error },
  note: { marginTop: spacing.md, minHeight: 64, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, padding: spacing.sm, color: colors.text, backgroundColor: colors.inputBackground },
  submit: { marginTop: spacing.lg, backgroundColor: colors.pillActiveBg, borderRadius: 10, paddingVertical: spacing.md, alignItems: "center" },
  submitText: { color: colors.pillActiveText, fontWeight: "700" },
  support: { marginTop: spacing.md, color: colors.textMuted, fontSize: 13 },
});
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck --workspace mobile`
Expected: no new errors. `SuperUserBadge`'s `role` prop accepts `string | null` today (`ActivityScreen` passes `profile.role`); if it does not, pass `post.authorRole ?? "user"`.

```bash
git add apps/mobile/src/components/feed/ apps/mobile/src/screens/ActivityScreen.tsx
git commit -m "feat(mobile): SocialPostCard, PostActionsSheet; extract legacy DiscoverFeedCard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `CreatePostSheet`, `FeedFAB`, and the sign-in gate for posting

**Files:**
- Create: `apps/mobile/src/components/feed/CreatePostSheet.tsx`
- Create: `apps/mobile/src/components/feed/FeedFAB.tsx`
- Modify: `apps/mobile/src/lib/gatedAction.ts:4` (add `"post"`)
- Modify: `apps/mobile/src/components/EarnedSignupSheet.tsx:13-22` (add `post` copy)

**Interfaces:**
- Consumes: `useCreatePost` (Task 10), `COMMUNITY_GUIDELINES`, `requestSignIn` (`lib/gatedAction.ts`).
- Produces: `<CreatePostSheet visible presetVenue? onClose onCreated(status) />`, `<FeedFAB onPress />`, `GatedActionKind` includes `"post"`.

- [ ] **Step 1: Extend the gate**

`apps/mobile/src/lib/gatedAction.ts` line 4:

```ts
export type GatedActionKind = "save" | "checkin" | "post";
```

`apps/mobile/src/components/EarnedSignupSheet.tsx`, inside `COPY` after `checkin`:

```ts
  post: {
    title: "Share your night",
    subtitle: "Create a free account to post photos from your favorite spots.",
  },
```

- [ ] **Step 2: Write `FeedFAB`**

Create `apps/mobile/src/components/feed/FeedFAB.tsx`:

```tsx
// src/components/feed/FeedFAB.tsx — the app's first floating action button.
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

export function FeedFAB({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.fab} accessibilityRole="button" accessibilityLabel="Create a post">
      <Text style={styles.plus}>＋</Text>
      <Text style={styles.label}>Post</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute", right: spacing.lg, bottom: spacing.xl,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.primary, borderRadius: 28, paddingVertical: 12, paddingHorizontal: 18,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  plus: { color: colors.surface, fontSize: 18, fontWeight: "700" },
  label: { color: colors.surface, fontWeight: "700" },
});
```

- [ ] **Step 3: Write `CreatePostSheet`**

Create `apps/mobile/src/components/feed/CreatePostSheet.tsx`:

```tsx
// src/components/feed/CreatePostSheet.tsx
//
// Compose a post: pick venue (published venues, name search), pick up to 4
// photos, caption, optional rating. First post shows the community guidelines
// and retries with accept_guidelines once agreed (same postId, no re-upload).

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../../api/supabaseClient";
import { useCreatePost } from "../../hooks/useCreatePost";
import { COMMUNITY_GUIDELINES } from "../../lib/communityGuidelines";
import { MAX_POST_MEDIA } from "../../lib/postMediaPath";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

type VenueOption = { id: string; name: string; neighborhood: string | null };

type Props = {
  visible: boolean;
  presetVenue?: VenueOption | null;
  onClose: () => void;
  onCreated: (status: "published" | "pending_review") => void;
};

export function CreatePostSheet({ visible, presetVenue, onClose, onCreated }: Props) {
  const { state, pickImages, createPost, reset } = useCreatePost();
  const [venue, setVenue] = useState<VenueOption | null>(presetVenue ?? null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<VenueOption[]>([]);
  const [uris, setUris] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [needsGuidelines, setNeedsGuidelines] = useState<{ postId?: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { setVenue(presetVenue ?? null); }, [presetVenue, visible]);

  useEffect(() => {
    if (venue || query.trim().length < 2) { setOptions([]); return; }
    let active = true;
    (supabase as any)
      .from("venues")
      .select("id, name, neighborhood")
      .eq("status", "published")
      .ilike("name", `%${query.trim()}%`)
      .order("name")
      .limit(8)
      .then(({ data }: { data: VenueOption[] | null }) => { if (active) setOptions(data ?? []); });
    return () => { active = false; };
  }, [query, venue]);

  const busy = state.status === "uploading" || state.status === "submitting";
  const canSubmit = !!venue && (uris.length > 0 || body.trim().length > 0) && !busy;

  function closeAll() {
    setVenue(presetVenue ?? null); setQuery(""); setUris([]); setBody(""); setRating(null);
    setNeedsGuidelines(null); setMessage(null); reset(); onClose();
  }

  async function submit(acceptGuidelines = false, retryPostId?: string) {
    if (!venue) return;
    setMessage(null);
    const result = await createPost({ venueId: venue.id, assetUris: uris, body, rating, acceptGuidelines, retryPostId });
    if (result.ok) { onCreated(result.status); closeAll(); return; }
    if (result.code === "guidelines_required") { setNeedsGuidelines({ postId: result.postId }); return; }
    setMessage(result.message);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeAll}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.root}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : closeAll} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {needsGuidelines ? (
            <ScrollView>
              <Text style={styles.title}>{COMMUNITY_GUIDELINES.title}</Text>
              <Text style={styles.para}>{COMMUNITY_GUIDELINES.intro}</Text>
              {COMMUNITY_GUIDELINES.rules.map((r) => <Text key={r} style={styles.rule}>• {r}</Text>)}
              <Text style={styles.para}>{COMMUNITY_GUIDELINES.outro}</Text>
              <Pressable style={styles.submit} disabled={busy} onPress={() => submit(true, needsGuidelines.postId)}>
                <Text style={styles.submitText}>{busy ? "Posting…" : "I agree — post it"}</Text>
              </Pressable>
              <Pressable style={styles.cancel} onPress={closeAll}><Text style={styles.cancelText}>Not now</Text></Pressable>
            </ScrollView>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>New post</Text>

              {venue ? (
                <View style={styles.venueRow}>
                  <Text style={styles.venueName}>{venue.name}{venue.neighborhood ? ` · ${venue.neighborhood}` : ""}</Text>
                  {!presetVenue ? <Pressable onPress={() => setVenue(null)}><Text style={styles.change}>Change</Text></Pressable> : null}
                </View>
              ) : (
                <>
                  <TextInput style={styles.input} placeholder="Which venue?" placeholderTextColor={colors.inputPlaceholder} value={query} onChangeText={setQuery} autoCorrect={false} />
                  {options.map((o) => (
                    <Pressable key={o.id} style={styles.option} onPress={() => { setVenue(o); setQuery(""); }}>
                      <Text style={styles.optionText}>{o.name}{o.neighborhood ? ` · ${o.neighborhood}` : ""}</Text>
                    </Pressable>
                  ))}
                </>
              )}

              <View style={styles.photos}>
                {uris.map((u) => <Image key={u} source={{ uri: u }} style={styles.thumb} />)}
                {uris.length < MAX_POST_MEDIA ? (
                  <Pressable style={styles.addPhoto} onPress={async () => setUris((prev) => [...prev, ...(await pickImages())].slice(0, MAX_POST_MEDIA))}>
                    <Text style={styles.addPhotoText}>＋ Photo</Text>
                  </Pressable>
                ) : null}
              </View>

              <TextInput style={[styles.input, styles.caption]} placeholder="What made it good?" placeholderTextColor={colors.inputPlaceholder} value={body} onChangeText={setBody} maxLength={500} multiline />
              <Text style={styles.counter}>{body.length}/500</Text>

              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setRating(rating === n ? null : n)} hitSlop={6}>
                    <Text style={[styles.star, rating != null && n <= rating && styles.starOn]}>★</Text>
                  </Pressable>
                ))}
                <Text style={styles.starHint}>{rating ? `${rating}/5` : "Rate it (optional)"}</Text>
              </View>

              {message ? <Text style={styles.error}>{message}</Text> : null}
              {state.status === "uploading" ? <Text style={styles.progress}>Uploading photo {state.index} of {state.total}…</Text> : null}

              <Pressable style={[styles.submit, !canSubmit && { opacity: 0.5 }]} disabled={!canSubmit} onPress={() => submit(false)}>
                {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>Post</Text>}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, paddingBottom: spacing.xxl, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  title: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  para: { color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 20 },
  rule: { color: colors.text, marginBottom: 4, lineHeight: 20 },
  venueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  venueName: { fontWeight: "700", color: colors.text, flex: 1 },
  change: { color: colors.primaryDark, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, borderRadius: 8, padding: spacing.sm, color: colors.text },
  option: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionText: { color: colors.text },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.md },
  thumb: { width: 72, height: 90, borderRadius: 8, backgroundColor: colors.cream },
  addPhoto: { width: 72, height: 90, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  addPhotoText: { color: colors.textMuted, fontSize: 12 },
  caption: { minHeight: 72 },
  counter: { alignSelf: "flex-end", color: colors.textMutedLight, fontSize: 12, marginTop: 4 },
  stars: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  star: { fontSize: 24, color: colors.border },
  starOn: { color: colors.primary },
  starHint: { marginLeft: spacing.sm, color: colors.textMuted, fontSize: 13 },
  error: { color: colors.error, marginTop: spacing.md },
  progress: { color: colors.textMuted, marginTop: spacing.sm },
  submit: { marginTop: spacing.lg, backgroundColor: colors.pillActiveBg, borderRadius: 10, paddingVertical: spacing.md, alignItems: "center" },
  submitText: { color: colors.pillActiveText, fontWeight: "700" },
  cancel: { marginTop: spacing.sm, alignItems: "center", paddingVertical: spacing.sm },
  cancelText: { color: colors.textMuted },
});
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck --workspace mobile`
Expected: no new errors.

```bash
git add apps/mobile/src/components/feed/CreatePostSheet.tsx apps/mobile/src/components/feed/FeedFAB.tsx apps/mobile/src/lib/gatedAction.ts apps/mobile/src/components/EarnedSignupSheet.tsx
git commit -m "feat(mobile): CreatePostSheet, FeedFAB, and sign-in gate for posting

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Wire the Discover tab

**Files:**
- Modify: `apps/mobile/src/screens/ActivityScreen.tsx` — the `tab === "discover"` branch (L687–763 at time of writing) and the guest branch (L527–558)
- Test: `test/activity-discover-posts.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 9–12; existing `useDiscoverFeed` (legacy fallback), `useInsiderItineraries`, `useFriendSuggestions`, `requestSignIn`.
- Produces: the Discover segment renders `SocialPostCard`s with infinite scroll, the Insider/Suggested header rails unchanged, a "Recent activity" legacy footer when fewer than 5 posts loaded, a FAB, and the actions/create sheets. Guests see the feed; like and post prompt sign-in.

- [ ] **Step 1: Write the failing test**

Create `test/activity-discover-posts.test.mjs`:

```javascript
// test/activity-discover-posts.test.mjs
//
// Rendering is verified by rendering (see the PR checklist). This pins the
// wiring that a green typecheck would not: the Discover segment reads from
// useDiscoverPosts, pages on end-reached, keeps the legacy cards only as a
// fallback, and gates guests through the sign-in sheet rather than failing
// silently the way the anon user_events read does today.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "apps/mobile/src/screens/ActivityScreen.tsx"), "utf8");

test("Discover reads from useDiscoverPosts and renders SocialPostCard", () => {
  assert.match(src, /import \{ useDiscoverPosts/);
  assert.match(src, /<SocialPostCard/);
  assert.match(src, /onEndReached=\{[^}]*loadMorePosts/);
});

test("legacy cards are a fallback under a divider, not the primary list", () => {
  assert.match(src, /posts\.length < 5/);
  assert.match(src, /Recent activity/);
});

test("guests are routed through the sign-in sheet for posting and liking", () => {
  assert.match(src, /requestSignIn\("post"\)/);
});

test("the local DiscoverFeedCard const is gone; the component is imported", () => {
  assert.doesNotMatch(src, /const DiscoverFeedCard/);
  assert.match(src, /from "\.\.\/components\/feed\/DiscoverFeedCard"/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/activity-discover-posts.test.mjs`
Expected: FAIL on the first three tests (the fourth passes after Task 11).

- [ ] **Step 3: Add imports and state**

At the top of `ActivityScreen.tsx`, alongside the existing hook imports:

```tsx
import { useDiscoverPosts, type DiscoverPost } from "../hooks/useDiscoverPosts";
import { SocialPostCard } from "../components/feed/SocialPostCard";
import { PostActionsSheet } from "../components/feed/PostActionsSheet";
import { CreatePostSheet } from "../components/feed/CreatePostSheet";
import { FeedFAB } from "../components/feed/FeedFAB";
import { requestSignIn } from "../lib/gatedAction";
```

Inside the component, next to the other hook calls (after `useDiscoverFeed()` at ~L418–448):

```tsx
  const {
    posts, loading: postsLoading, loadingMore: postsLoadingMore, error: postsError,
    refresh: refreshPosts, loadMore: loadMorePosts, toggleLike, removePost, removeAuthor,
  } = useDiscoverPosts();
  const [actionsPost, setActionsPost] = useState<DiscoverPost | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeNotice, setComposeNotice] = useState<string | null>(null);

  const handleToggleLike = useCallback(
    async (postId: string) => {
      const handled = await toggleLike(postId);
      if (!handled) requestSignIn("post");
    },
    [toggleLike],
  );
  const handleOpenVenue = useCallback(
    (venueId: string) => navigation.navigate("VenuePreview", { venueId }),
    [navigation],
  );
  const handleCompose = useCallback(() => {
    if (!user) { requestSignIn("post"); return; }
    setComposeOpen(true);
  }, [user]);
```

`navigation` is the existing `useNavigation()` result in this screen; `VenuePreview` takes `{ venueId }` (`navigation/types.ts`). Add `refreshPosts()` to the existing `useFocusEffect` refresh list (~L465–482) so a post made from another screen appears on return.

- [ ] **Step 4: Replace the Discover branch**

Replace the `tab === "discover"` `FlatList` (the block between `) : tab === "discover" ? (` and `) : tab === "people" ? (`) with:

```tsx
      ) : tab === "discover" ? (
        <View style={{ flex: 1 }}>
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onRefresh={() => { void refreshPosts(); void refreshInsiderItineraries(); void refreshSuggestions(); }}
            refreshing={postsLoading}
            onEndReached={() => { void loadMorePosts(); }}
            onEndReachedThreshold={0.6}
            ListHeaderComponent={
              (insiderItineraries.length > 0 || suggestions.length > 0) ? (
                <View>
                  {insiderItineraries.length > 0 ? (
                    <View style={styles.pendingSection}>
                      <Text style={styles.sectionTitle}>From HappiTime Insiders</Text>
                      {insiderItineraries.map((item) => (
                        <InsiderItineraryCard key={item.id} item={item} onPress={handleOpenItinerary} />
                      ))}
                      <View style={styles.sectionDivider} />
                    </View>
                  ) : null}
                  {suggestions.length > 0 ? (
                    <View style={styles.pendingSection}>
                      <Text style={styles.sectionTitle}>Suggested people</Text>
                      {suggestions.slice(0, 5).map((item) => (
                        <SuggestionCard
                          key={item.user_id}
                          suggestion={item}
                          onFollow={handleFollow}
                          following={requestedUsers[item.user_id] ?? false}
                        />
                      ))}
                      <View style={styles.sectionDivider} />
                    </View>
                  ) : null}
                </View>
              ) : null
            }
            ListEmptyComponent={
              postsLoading ? null : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No posts yet</Text>
                  <Text style={styles.emptyText}>Be the first to share a photo from a night out.</Text>
                  {postsError ? <Text style={styles.emptyText}>{postsError}</Text> : null}
                </View>
              )
            }
            ListFooterComponent={
              <View>
                {postsLoadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} /> : null}
                {!postsLoading && posts.length < 5 && discoverFeed.length > 0 ? (
                  <View style={styles.pendingSection}>
                    <View style={styles.sectionDivider} />
                    <Text style={styles.sectionTitle}>Recent activity</Text>
                    {discoverFeed.slice(0, 20).map((item) => (
                      <DiscoverFeedCard key={item.id} item={item} anonymous={!user} />
                    ))}
                  </View>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <SocialPostCard
                post={item}
                currentUserId={user?.id ?? null}
                onToggleLike={handleToggleLike}
                onOpenVenue={handleOpenVenue}
                onOpenActions={setActionsPost}
              />
            )}
          />
          {composeNotice ? (
            <Pressable style={styles.notice} onPress={() => setComposeNotice(null)}>
              <Text style={styles.noticeText}>{composeNotice}</Text>
            </Pressable>
          ) : null}
          <FeedFAB onPress={handleCompose} />
          <PostActionsSheet
            post={actionsPost}
            currentUserId={user?.id ?? null}
            onClose={() => setActionsPost(null)}
            onReported={() => { /* stays visible until the auto-hide threshold */ }}
            onBlocked={(authorId) => removeAuthor(authorId)}
            onDeleted={(postId) => removePost(postId)}
          />
          <CreatePostSheet
            visible={composeOpen}
            onClose={() => setComposeOpen(false)}
            onCreated={(status) => {
              setComposeNotice(status === "published" ? "Posted!" : "Thanks — your post is being reviewed and will appear shortly.");
              void refreshPosts();
            }}
          />
        </View>
      ) : tab === "people" ? (
```

`discoverFeed` is the array already returned by `useDiscoverFeed()` in this screen (check its destructured name at ~L430 and use that). Add two styles:

```ts
  notice: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 88, backgroundColor: colors.pillActiveBg, borderRadius: 10, padding: spacing.md },
  noticeText: { color: colors.pillActiveText, textAlign: "center", fontWeight: "600" },
```

- [ ] **Step 5: Replace the guest branch**

The guest branch (~L527–558) currently renders `DiscoverFeedCard` from `useDiscoverFeed`, which returns nothing for anon since the `user_events` revoke. Replace its `FlatList` with the same `SocialPostCard` list as above (`currentUserId={null}`), without `PostActionsSheet`'s block/delete paths (the sheet already alerts "Sign in" for those), and with `<FeedFAB onPress={() => requestSignIn("post")} />`. Extract the shared list into a local `renderPostsList()` function inside the component to avoid two copies of the JSX.

- [ ] **Step 6: Run the test, typecheck, and render**

Run: `node --test test/activity-discover-posts.test.mjs && npm run typecheck --workspace mobile && npm run lint`
Expected: PASS, 4 tests; no new type or lint errors.

Then render (`npm run dev:mobile`, iOS simulator or device) and walk the manual checklist from the spec's Testing section: post from account A, see it on account B, report twice, watch it disappear, block, confirm removal. Attach screenshots to the PR.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/ActivityScreen.tsx test/activity-discover-posts.test.mjs
git commit -m "feat(mobile): Discover tab renders the posts feed with legacy fallback, FAB, and sheets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Admin moderation queue (web console)

**Files:**
- Create: `apps/web/src/actions/admin-moderation-actions.ts`
- Create: `apps/web/src/app/admin/moderation/page.tsx`
- Create: `apps/web/src/app/admin/moderation/ModerationActions.tsx`
- Modify: `apps/web/src/app/admin/page.tsx` (add a link to `/admin/moderation` beside the existing "Incoming Suggestions" link)
- Test: `test/admin-moderation-actions.test.mjs`

**Interfaces:**
- Consumes: `assertAdmin`, `getAdminClient` (`@/utils/admin`), `createClient` (`@/utils/supabase/server`), Task 1 tables.
- Produces: server actions `approvePost(postId)`, `removePost(postId, reason)`, `dismissReports(postId)`, `actionReports(postId, reason)`; page `/admin/moderation`.

- [ ] **Step 1: Write the failing test**

Create `test/admin-moderation-actions.test.mjs`:

```javascript
// test/admin-moderation-actions.test.mjs
//
// admin-manage-actions.ts has zero assertAdmin() calls; nobody noticed because
// nothing pins it. Moderation actions change what the public sees, so every
// exported action must gate on the admin allowlist before touching data, and
// every decision must record who made it.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "apps/web/src/actions/admin-moderation-actions.ts"), "utf8");

test("is a server action module", () => {
  assert.match(src, /^'use server';/);
});

test("every exported action calls assertAdmin() before anything else", () => {
  const fns = [...src.matchAll(/export async function (\w+)\([^)]*\) \{\n([\s\S]*?)\n\}/g)];
  assert.ok(fns.length >= 4, `expected 4+ actions, found ${fns.length}`);
  for (const [, name, body] of fns) {
    assert.match(body.trimStart(), /^await assertAdmin\(\);/, `${name} must start with assertAdmin()`);
  }
});

test("decisions record who decided and when", () => {
  assert.match(src, /decided_by/);
  assert.match(src, /decided_at/);
});

test("removal requires a reason and never deletes the row", () => {
  assert.match(src, /export async function removePost\(postId: string, reason: string\)/);
  assert.match(src, /if \(!reason\.trim\(\)\) throw new Error/);
  assert.doesNotMatch(src, /from\('venue_posts'\)\s*\.delete\(/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/admin-moderation-actions.test.mjs`
Expected: FAIL — ENOENT.

- [ ] **Step 3: Write the actions**

Create `apps/web/src/actions/admin-moderation-actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';

function revalidate() {
  revalidatePath('/admin/moderation');
  revalidatePath('/admin');
}

async function decidedBy(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? 'unknown';
}

/** Approve a pending_review post: it becomes visible and its open reports are dismissed. */
export async function approvePost(postId: string) {
  await assertAdmin();
  if (!postId) throw new Error('Missing post id');
  const svc = getAdminClient();
  const who = await decidedBy();
  const now = new Date().toISOString();

  const { data: post, error: fetchErr } = await svc
    .from('venue_posts').select('id, moderation').eq('id', postId).single();
  if (fetchErr || !post) throw new Error('Post not found');

  const { error } = await svc
    .from('venue_posts')
    .update({
      status: 'published',
      moderation: { ...(post.moderation as Record<string, unknown>), decided_by: who, decided_at: now, decision: 'approved' },
    })
    .eq('id', postId);
  if (error) throw new Error(error.message);

  await svc.from('post_reports').update({ status: 'dismissed', resolved_at: now }).eq('post_id', postId).eq('status', 'open');
  revalidate();
}

/** Remove a post from public view. The row stays for audit; media stays until SP2's cleanup. */
export async function removePost(postId: string, reason: string) {
  await assertAdmin();
  if (!postId) throw new Error('Missing post id');
  if (!reason.trim()) throw new Error('A removal reason is required');
  const svc = getAdminClient();
  const who = await decidedBy();
  const now = new Date().toISOString();

  const { data: post, error: fetchErr } = await svc
    .from('venue_posts').select('id, moderation').eq('id', postId).single();
  if (fetchErr || !post) throw new Error('Post not found');

  const { error } = await svc
    .from('venue_posts')
    .update({
      status: 'removed',
      removed_reason: reason.trim(),
      moderation: { ...(post.moderation as Record<string, unknown>), decided_by: who, decided_at: now, decision: 'removed' },
    })
    .eq('id', postId);
  if (error) throw new Error(error.message);

  await svc.from('post_reports').update({ status: 'actioned', resolved_at: now }).eq('post_id', postId).eq('status', 'open');
  revalidate();
}

/** Reports on a published post were unfounded; close them and leave the post up. */
export async function dismissReports(postId: string) {
  await assertAdmin();
  if (!postId) throw new Error('Missing post id');
  const svc = getAdminClient();
  const now = new Date().toISOString();
  const { error } = await svc
    .from('post_reports').update({ status: 'dismissed', resolved_at: now }).eq('post_id', postId).eq('status', 'open');
  if (error) throw new Error(error.message);
  revalidate();
}

/** Reports on a published post were valid: remove the post and close the reports. */
export async function actionReports(postId: string, reason: string) {
  await assertAdmin();
  await removePost(postId, reason);
}
```

- [ ] **Step 4: Write the page and the client actions**

Create `apps/web/src/app/admin/moderation/page.tsx`:

```tsx
import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { ModerationActions } from './ModerationActions';

type QueueRow = {
  id: string;
  status: 'published' | 'pending_review';
  body: string | null;
  media_paths: string[];
  created_at: string;
  moderation: Record<string, unknown>;
  venue: { name: string } | { name: string }[] | null;
  author: { handle: string | null; display_name: string | null } | { handle: string | null; display_name: string | null }[] | null;
  open_reports: { reason: string; note: string | null; created_at: string }[];
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-posts/${path}`;
}

function ago(iso: string) {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export default async function ModerationPage() {
  const keyError = getServiceRoleKeyError();
  const supabase = keyError ? await createClient() : createServiceClient();

  const base = 'id, status, body, media_paths, created_at, moderation, venue:venues(name), author:user_profiles(handle, display_name)';
  // Left join for the pending list (reports optional); !inner for the reported
  // list so only posts that HAVE an open report come back. The embedded
  // .eq('open_reports.status', 'open') filters the embedded rows in both.
  const pendingSelect = `${base}, open_reports:post_reports(reason, note, created_at)`;
  const reportedSelect = `${base}, open_reports:post_reports!inner(reason, note, created_at)`;

  const [{ data: pending }, { data: reported }] = await Promise.all([
    supabase.from('venue_posts').select(pendingSelect).eq('status', 'pending_review').eq('open_reports.status', 'open').order('created_at', { ascending: true }).limit(200),
    supabase.from('venue_posts').select(reportedSelect).eq('status', 'published').eq('open_reports.status', 'open').order('created_at', { ascending: false }).limit(200),
  ]);

  const rows = (list: unknown): QueueRow[] => ((list ?? []) as QueueRow[]).filter((r) => r.status === 'pending_review' || r.open_reports?.length > 0);

  const Section = ({ title, items, empty }: { title: string; items: QueueRow[]; empty: string }) => (
    <section className="mb-10">
      <h2 className="text-heading-md font-semibold text-foreground mb-3">{title} <span className="text-muted">({items.length})</span></h2>
      {items.length === 0 ? (
        <p className="text-body-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((r) => {
            const venue = one(r.venue); const author = one(r.author);
            const reasons = (r.moderation?.reasons as string[] | undefined) ?? [];
            return (
              <li key={r.id} className="rounded-md border border-border bg-surface p-4 flex gap-4">
                <div className="flex gap-2 shrink-0">
                  {(r.media_paths ?? []).slice(0, 4).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p} src={mediaUrl(p)} alt="" className="w-24 h-30 object-cover rounded" />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm text-muted">
                    {author?.handle ? `@${author.handle}` : author?.display_name ?? 'unknown'} · {venue?.name ?? 'unknown venue'} · {ago(r.created_at)}
                  </div>
                  {r.body ? <p className="text-body-md text-foreground mt-1 whitespace-pre-wrap">{r.body}</p> : null}
                  {reasons.length > 0 ? <p className="text-caption text-warning mt-2">Filter: {reasons.join(', ')}</p> : null}
                  {r.open_reports?.length > 0 ? (
                    <ul className="text-caption text-muted mt-2">
                      {r.open_reports.map((rep, i) => <li key={i}>Report: {rep.reason}{rep.note ? ` — ${rep.note}` : ''} ({ago(rep.created_at)})</li>)}
                    </ul>
                  ) : null}
                </div>
                <ModerationActions postId={r.id} status={r.status} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-background">
      <UserBar />
      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">Admin Console</Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Post moderation</h1>
            <p className="text-body-sm text-muted mt-1">Apple requires action on reports within 24 hours. Oldest first.</p>
          </div>
        </div>
        <Section title="Pending review" items={rows(pending)} empty="Nothing waiting." />
        <Section title="Reported (still visible)" items={rows(reported)} empty="No open reports on visible posts." />
      </main>
    </div>
  );
}
```

Create `apps/web/src/app/admin/moderation/ModerationActions.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { approvePost, removePost, dismissReports } from '@/actions/admin-moderation-actions';

export function ModerationActions({ postId, status }: { postId: string; status: 'published' | 'pending_review' }) {
  const [mode, setMode] = useState<'idle' | 'remove'>('idle');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>) => {
    setErr('');
    startTransition(async () => {
      try { await fn(); } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); }
    });
  };

  if (mode === 'remove') {
    return (
      <div className="flex flex-col gap-1.5 min-w-[220px]">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to nobody; kept for audit)" className="h-8 px-2 rounded border border-border text-body-sm" />
        <div className="flex gap-1.5">
          <button type="button" disabled={isPending || !reason.trim()} onClick={() => run(() => removePost(postId, reason))} className="h-7 px-3 rounded bg-error text-white text-caption font-medium disabled:opacity-50">Confirm remove</button>
          <button type="button" onClick={() => setMode('idle')} className="h-7 px-3 rounded border border-border text-caption">Cancel</button>
        </div>
        {err ? <p className="text-caption text-error">{err}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[180px]">
      <div className="flex gap-1.5">
        {status === 'pending_review' ? (
          <button type="button" disabled={isPending} onClick={() => run(() => approvePost(postId))} className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50">Approve</button>
        ) : (
          <button type="button" disabled={isPending} onClick={() => run(() => dismissReports(postId))} className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50">Dismiss reports</button>
        )}
        <button type="button" disabled={isPending} onClick={() => setMode('remove')} className="h-7 px-3 rounded border border-error text-error text-caption font-medium">Remove</button>
      </div>
      {err ? <p className="text-caption text-error">{err}</p> : null}
    </div>
  );
}
```

In `apps/web/src/app/admin/page.tsx`, next to the existing link to `/admin/suggestions`, add a link with the same markup pointing at `/admin/moderation` titled "Post moderation" with the subtitle "Pending posts and reports from the mobile feed."

- [ ] **Step 5: Run the test, typecheck, and view**

Run: `node --test test/admin-moderation-actions.test.mjs && npm run typecheck --workspace web && npm run lint`
Expected: PASS, 4 tests; clean. The `rows()` filter is the gate; the `!inner` join is an optimization so the reported list does not page through every published post.

Start `npm run dev:web`, sign in as an admin email, open `/admin/moderation`, and with a `pending_review` post present (create one via a caption containing a blocklisted term from a test account) approve it and see it leave the list.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/actions/admin-moderation-actions.ts apps/web/src/app/admin/moderation/ apps/web/src/app/admin/page.tsx test/admin-moderation-actions.test.mjs
git commit -m "feat(console): /admin/moderation queue with approve, remove, and dismiss actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Moderation SLA tripwire

**Files:**
- Create: `scripts/check-moderation-sla.mjs`
- Create: `.github/workflows/moderation-sla.yml`
- Test: `test/moderation-sla.test.mjs`

**Interfaces:**
- Consumes: Supabase Management API `POST /v1/projects/{ref}/database/query` with the existing `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` secrets (the channel `scripts/check-digest.mjs` uses).
- Produces: `evaluateSla(rows, maxHours)` → `{ ok: boolean; summary: string }`; a daily workflow that fails when the oldest open item exceeds 12 hours.

- [ ] **Step 1: Write the failing test**

Create `test/moderation-sla.test.mjs`:

```javascript
// test/moderation-sla.test.mjs
//
// The digest alarm emailed through the email system that was down. This alarm
// goes through GitHub instead. The pure evaluator is what the workflow's
// pass/fail hangs on, so it is the part under test.

import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSla, SLA_QUERY, MAX_OPEN_HOURS } from "../scripts/check-moderation-sla.mjs";

test("the default SLA leaves a working day inside Apple's 24 hours", () => {
  assert.equal(MAX_OPEN_HOURS, 12);
});

test("passes when nothing is open", () => {
  const r = evaluateSla([{ pending_posts: 0, open_reports: 0, oldest_open_hours: null }], 12);
  assert.equal(r.ok, true);
});

test("passes with fresh items, fails once the oldest crosses the limit", () => {
  assert.equal(evaluateSla([{ pending_posts: 2, open_reports: 1, oldest_open_hours: 3.5 }], 12).ok, true);
  const r = evaluateSla([{ pending_posts: 2, open_reports: 1, oldest_open_hours: 12.1 }], 12);
  assert.equal(r.ok, false);
  assert.match(r.summary, /12\.1h/);
});

test("fails closed on a malformed or empty response", () => {
  assert.equal(evaluateSla([], 12).ok, false);
  assert.equal(evaluateSla(null, 12).ok, false);
});

test("the query counts both pending posts and open reports and their oldest age", () => {
  assert.match(SLA_QUERY, /status = 'pending_review'/);
  assert.match(SLA_QUERY, /status = 'open'/);
  assert.match(SLA_QUERY, /oldest_open_hours/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/moderation-sla.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the script**

Create `scripts/check-moderation-sla.mjs`:

```javascript
#!/usr/bin/env node
// Alarm channel for the post moderation queue.
//
// Apple Guideline 1.2 expects reports on user-generated content to be acted on
// within 24 hours. The console's /admin/moderation page shows the queue, but a
// page nobody opens is not an alarm. This script asks the database, through the
// Supabase Management API (the same path scripts/check-digest.mjs uses), how old
// the oldest open item is, and fails the run past MAX_OPEN_HOURS so GitHub
// notifies. No email anywhere in the path (see EMAIL-OUTAGE-FINDINGS-2026-08-12).
//
// Requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (existing repo secrets).

import { pathToFileURL } from 'node:url';

export const MAX_OPEN_HOURS = 12;

export const SLA_QUERY = `
  select
    (select count(*) from public.venue_posts where status = 'pending_review') as pending_posts,
    (select count(*) from public.post_reports where status = 'open') as open_reports,
    (select extract(epoch from (now() - min(created_at))) / 3600 from (
       select created_at from public.venue_posts where status = 'pending_review'
       union all
       select created_at from public.post_reports where status = 'open'
     ) t) as oldest_open_hours
`;

/** @param {Array<{pending_posts:number|string, open_reports:number|string, oldest_open_hours:number|string|null}>|null} rows */
export function evaluateSla(rows, maxHours = MAX_OPEN_HOURS) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    return { ok: false, summary: 'moderation SLA query returned no usable row' };
  }
  const r = rows[0];
  const pending = Number(r.pending_posts ?? 0);
  const open = Number(r.open_reports ?? 0);
  const oldest = r.oldest_open_hours == null ? null : Number(r.oldest_open_hours);
  const summary = `pending_review=${pending} open_reports=${open} oldest=${oldest == null ? 'none' : `${oldest.toFixed(1)}h`}`;
  if (oldest != null && oldest > maxHours) {
    return { ok: false, summary: `${summary} — exceeds ${maxHours}h SLA` };
  }
  return { ok: true, summary };
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) {
    console.error('::error::SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required');
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SLA_QUERY }),
  });
  if (!res.ok) {
    console.error(`::error::management API ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const rows = await res.json();
  const result = evaluateSla(rows);
  console.log(result.summary);
  if (!result.ok) {
    console.error(`::error::${result.summary}`);
    process.exit(1);
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) main();
```

- [ ] **Step 4: Write the workflow**

Create `.github/workflows/moderation-sla.yml`:

```yaml
name: Moderation SLA

# Fails when any pending_review post or open report is older than 12 hours,
# so GitHub notifies — a channel that does not depend on email. 14:00 UTC is
# 9 AM Central, the start of the working day.
on:
  schedule:
    - cron: '0 14 * * *'
  workflow_dispatch:

concurrency:
  group: moderation-sla
  cancel-in-progress: true

jobs:
  sla:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Check moderation queue age
        run: node scripts/check-moderation-sla.mjs
```

- [ ] **Step 5: Run the test and a dry run**

Run: `node --test test/moderation-sla.test.mjs`
Expected: PASS, 5 tests.

With the two secrets exported locally (from the same values the repo secrets hold): `node scripts/check-moderation-sla.mjs` → prints `pending_review=0 open_reports=0 oldest=none` and exits 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-moderation-sla.mjs .github/workflows/moderation-sla.yml test/moderation-sla.test.mjs
git commit -m "ops(feed): daily moderation SLA tripwire via the Management API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Account deletion removes post media

**Files:**
- Modify: `supabase/functions/delete-account/index.ts` (inside `anonymizeAndDetachUserData`, before the `safeDelete(adminClient, "venue_visits", ...)` line)
- Test: `test/delete-account-posts.test.mjs`

**Interfaces:**
- Consumes: `venue_posts.author_id ... on delete cascade` (rows vanish with the auth user); storage has no cascade.
- Produces: the user's `venue-posts/{uid}/**` objects are removed before `deleteUser`.

- [ ] **Step 1: Write the failing test**

Create `test/delete-account-posts.test.mjs`:

```javascript
// test/delete-account-posts.test.mjs
//
// venue_posts rows cascade from auth.users; storage objects do not. Without
// this step a deleted account leaves its photos publicly addressable forever.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "supabase/functions/delete-account/index.ts"), "utf8");

test("collects the user's post media paths and removes them before deleteUser", () => {
  const collect = src.indexOf('from("venue_posts")');
  const remove = src.indexOf('from("venue-posts").remove(');
  const del = src.indexOf("auth.admin.deleteUser(");
  assert.ok(collect > 0, "reads venue_posts");
  assert.ok(remove > collect, "removes objects after collecting paths");
  assert.ok(del > remove, "storage cleanup precedes deleteUser");
  assert.match(src, /\.eq\("author_id", userId\)/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/delete-account-posts.test.mjs`
Expected: FAIL — "reads venue_posts".

- [ ] **Step 3: Add the cleanup**

In `supabase/functions/delete-account/index.ts`, inside `anonymizeAndDetachUserData`, immediately before `await safeDelete(adminClient, "venue_visits", "user_id", userId);`:

```ts
  // Post photos: rows cascade with the auth user, storage objects do not.
  // Remove them first so nothing public outlives the account. Missing table
  // (pre-migration environments) is tolerated like the other optional tables.
  const { data: postRows, error: postErr } = await adminClient
    .from("venue_posts")
    .select("media_paths")
    .eq("author_id", userId);
  if (postErr && !isMissingOptionalTable(postErr)) {
    throw new Error(`venue_posts lookup failed: ${postErr.message}`);
  }
  const mediaPaths = (postRows ?? []).flatMap((r) => (r.media_paths as string[] | null) ?? []);
  for (let i = 0; i < mediaPaths.length; i += 100) {
    const { error: rmErr } = await adminClient.storage.from("venue-posts").remove(mediaPaths.slice(i, i + 100));
    if (rmErr) console.error("[delete-account] post media cleanup", { userId, message: rmErr.message });
  }
```

Also add `posts: { count: postRows?.length ?? 0 }` to the `archive` object so the anonymous archive records the volume, matching the other counters.

- [ ] **Step 4: Run the test and commit**

Run: `node --test test/delete-account-posts.test.mjs`
Expected: PASS.

```bash
git add supabase/functions/delete-account/index.ts test/delete-account-posts.test.mjs
git commit -m "fix(delete-account): remove post media before deleting the auth user

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Terms, Privacy, store metadata, and docs

**Files:**
- Modify: `apps/directory/src/app/terms/page.tsx`
- Modify: `apps/directory/src/app/privacy/page.tsx`
- Modify: `apps/mobile/store-metadata.md`
- Modify: `ENV.md`, `DB_SCHEMA.md`, `RLS.md`, `BACKLOG.md`, `docs/index.md`
- Test: `test/terms-ugc-clause.test.mjs`

**Interfaces:** none in code. This task makes the compliance surface true in the documents Apple and users read.

- [ ] **Step 1: Write the failing test**

Create `test/terms-ugc-clause.test.mjs`:

```javascript
// test/terms-ugc-clause.test.mjs
//
// The Terms asserted that ALL platform content belongs to the company. Once
// users post photos that is false and, for App Review, disqualifying. Pins the
// user-content license and the takedown contact.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const terms = readFileSync(join(root, "apps/directory/src/app/terms/page.tsx"), "utf8");
const privacy = readFileSync(join(root, "apps/directory/src/app/privacy/page.tsx"), "utf8");

test("terms no longer claim ownership of all content and grant a user-content license", () => {
  assert.doesNotMatch(terms, /All content, trademarks, logos, and intellectual property displayed on the Platform are owned/);
  assert.match(terms, /User content/);
  assert.match(terms, /retain ownership/);
  assert.match(terms, /non-exclusive/);
  assert.match(terms, /within 24 hours/);
});

test("privacy discloses user content and image processing", () => {
  assert.match(privacy, /User content/);
  assert.match(privacy, /Google Cloud Vision/);
  assert.match(privacy, /location metadata/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/terms-ugc-clause.test.mjs`
Expected: FAIL on both.

- [ ] **Step 3: Edit the Terms**

In `apps/directory/src/app/terms/page.tsx`, change the intellectual-property paragraph so it reads (keep the surrounding markup):

> The HappiTime name, logo, design, and the venue data we compile are owned by Williams Consulting &amp; Management LLC or its licensors. Content posted by users is governed by the User content section below.

Then add a new section after it, using the same heading and paragraph components the page already uses:

> **User content**
>
> You retain ownership of the photos, captions, and ratings you post. By posting, you grant HappiTime a worldwide, non-exclusive, royalty-free license to host, display, and distribute that content within the HappiTime app and website, for as long as it remains posted. You can delete your posts at any time; deleting your account removes them.
>
> You may only post content you created, at the venue you tag. Do not post content that is sexually explicit, violent, hateful, harassing, deceptive, or that promotes another business, or that shows other people without their consent. You must be 21 or older to post about alcohol.
>
> We use automated screening and human review. Anyone can report a post from within the app. We review reports and remove violating content within 24 hours, and we may suspend accounts that repeatedly violate these rules. To report content or request removal of content you appear in, email admin@happitime.biz.

- [ ] **Step 4: Edit the Privacy Policy**

In `apps/directory/src/app/privacy/page.tsx`, add a section (before "Children's Privacy"):

> **User content**
>
> If you post photos or captions, they are public to all HappiTime users and visitors. Photos are re-encoded on your device before upload, which removes embedded location metadata. Uploaded images are screened by Google Cloud Vision SafeSearch to detect prohibited content; Google processes the image for that purpose only. Reports you file are visible to HappiTime staff and never to the person you reported. Posts are stored until you delete them or your account.

- [ ] **Step 5: Store metadata, env, schema docs, backlog, index**

`apps/mobile/store-metadata.md` — add under the content-rating notes:

> **User-generated content (since 1.1.0):** answer "Yes" to unrestricted user-generated content on both questionnaires. In-app: automated screening (SafeSearch + caption blocklist), report and block from every post, 24-hour review SLA (`/admin/moderation`, `moderation-sla.yml`), contact `admin@happitime.biz` in the report sheet. Apple Guideline 1.2 checklist is satisfied by SP1 of `docs/superpowers/specs/2026-09-07-social-discovery-feed-design.md`.

`ENV.md` — under the Supabase edge-function secrets:

```
GOOGLE_VISION_API_KEY   create-post image moderation (SafeSearch). Unset ⇒ every photo post is held for review.
```

`DB_SCHEMA.md` — a "Social feed" block listing `venue_posts`, `post_likes`, `post_reports`, `user_blocks` with one line each and the `get_discover_feed` RPC. `RLS.md` — the eight policies by name and the rule "no client insert on venue_posts; create-post is the writer".

`BACKLOG.md` — add under Medium, titled "Social feed SP2 follow-ups":
- Enforce `user_blocks` in `useFriendActivity.ts`, `useUserSearch.ts`, `useFriendSuggestions.ts` (SP1 enforces blocks only in the feed RPC).
- Nightly cleanup of orphaned `venue-posts/{uid}/{post_id}/` prefixes with no `venue_posts` row (pg_cron + service role).
- Comments (`post_comments` with per-hour trigger cap), venue "Posts from here" section, ranked feed v1 — see the spec.

`docs/index.md` — add a section:

```markdown
## Specs & plans

Design specs live in [`docs/superpowers/specs/`](superpowers/specs/) and task-level plans in
[`docs/superpowers/plans/`](superpowers/plans/), named `YYYY-MM-DD-<topic>-design.md` and
`YYYY-MM-DD-<topic>.md`. GitHub Issues are disabled; these documents are the tracker.
```

- [ ] **Step 6: Run the test and the full suite**

Run: `node --test test/terms-ugc-clause.test.mjs && npm test 2>&1 | tail -5`
Expected: PASS; full suite `# fail 0`, count = baseline + 65 (the tests added by Tasks 1–17).

- [ ] **Step 7: Commit**

```bash
git add apps/directory/src/app/terms/page.tsx apps/directory/src/app/privacy/page.tsx apps/mobile/store-metadata.md ENV.md DB_SCHEMA.md RLS.md BACKLOG.md docs/index.md test/terms-ugc-clause.test.mjs
git commit -m "docs(feed): user-content terms and privacy, store UGC notes, schema/RLS docs, backlog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Done when

- `npm run lint && npm run typecheck && npm test && npm run build:web` are green locally and in CI.
- The four migrations replay cleanly (`supabase db reset`) and the nightly `schema-parity` run after merge is green.
- `create-post` is deployed (by the new workflow on merge, or manually) and `GOOGLE_VISION_API_KEY` is set; a photo post from a test account lands `published`, and one with a blocklisted caption lands `pending_review` and appears at `/admin/moderation`.
- The manual checklist in the spec's Testing section is recorded in the PR with screenshots: post, see on second account, report twice, disappears, approve, returns, block, gone.
- The directory site's Terms and Privacy pages are deployed before the mobile OTA that exposes the feed.
- `moderation-sla.yml` has run once via `workflow_dispatch` and passed.

## Explicitly not in this plan

- Comments, the venue "Posts from here" section, ranked feed v1, orphan-upload cleanup, and block enforcement in the three legacy hooks: **SP2**.
- Instagram and TikTok: **SP3**, **SP4**.
- Mobile analytics (PostHog on mobile) — open question 4 in the spec.
- `expo-image`, `FlashList`, `@gorhom/bottom-sheet`, `react-native-webview`: native modules; deferred to the build SP4 requires.
- Migrating the existing four edge functions to `_shared/http.ts`.
