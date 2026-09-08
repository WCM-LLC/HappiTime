# Social Discovery Feed — Integration Design

**Date:** 2026-09-07
**Status:** Awaiting review
**Scope:** Integration of the "Social Discovery Feed Architecture Document v1.0 (May 2026)" into the
HappiTime monorepo as it exists on 2026-09-07. Covers all three phases (UGC, Instagram, TikTok) at
design depth; the first sub-project has a task-level plan at
`docs/superpowers/plans/2026-09-07-social-feed-sp1-ugc-spine.md`.
**Source:** Google Doc `1vHK7jbbahRxRlrASvFloRIhb7y41GQqR_VgwaZve-Mk` (also
`HappiTime_Social_Discovery_Feed_Architecture.docx`, 2026-05-05, in the GitHub folder).

## Why

The Activity screen's Discover tab today shows one-line sentences ("@x checked in") generated
from `user_events`. The architecture doc proposes replacing it with a photo-first feed of venue
content from three sources: HappiTime users, venue Instagram accounts, and venue TikTok accounts.

The doc was written in May against a codebase that has moved. Every claim it makes about existing
infrastructure was checked against the repo; the corrections below change the shape of the work.
Three findings dominate:

1. **Apple App Store Guideline 1.2 compliance does not exist.** An app with user-generated content
   must ship a content filter, a report flow, a user-block flow, and published contact info, and
   must act on reports within 24 hours. None of the four exist. This is a launch blocker for
   Phase 1, not a Phase 1 week-4 polish item, so it moves to the front.
2. **The current Terms of Service contradict a UGC model.** `apps/directory/src/app/terms/page.tsx`
   asserts all content on the platform is owned by Williams Consulting & Management LLC. Users
   posting photos need a license grant and an acceptable-use policy. The Privacy Policy has no
   user-content section.
3. **The repo's security posture is stricter than the doc assumes.** No Vault, no pgsodium;
   `check_rate_limit` is service-role only; every new table needs explicit grants; bare
   `auth.uid()` in a policy regresses an August migration; storage policies are uid-prefix scoped.
   The doc's schema, RLS, and storage layout all need adjusting to fit.

Measured scale (production, 2026-08-13): 69 regular users, 4 super users, 174 published venues,
KC only. That number drives the algorithm choice: a small, explainable SQL ranking beats a
learned one, and human moderation is feasible.

## Corrections to the architecture doc

| Doc claim | Reality (file:line) | Consequence |
|---|---|---|
| ActivityScreen has 3 tabs (Friends, Discover, Check-ins) | 5 tabs: `notifications, friends, discover, people, checkins` — `apps/mobile/src/screens/ActivityScreen.tsx:392,568-581` | Discover stays one segment among five; the in-flight `useActivityDeepLink` (uncommitted on `master`) targets these segments |
| `DiscoverFeedCard` component | A 39-line local const inside `ActivityScreen.tsx:314-352`, not exported | New `SocialPostCard` is a new file; the legacy card gets extracted alongside it |
| `useDiscoverActivity` feeds Discover | It is an itinerary-share inbox, unused by ActivityScreen — `apps/mobile/src/hooks/useDiscoverActivity.ts:37` | Ignore it; `useDiscoverFeed.ts` is the live hook |
| `VenueDetailScreen` gets a "Posts" tab | No such screen. `HappyHourDetailScreen.tsx` (1033 lines, no tabs) and `VenuePreviewScreen.tsx` split the role | Venue posts become a section, not a tab, in sub-project 2 |
| Cursor pagination "extends" existing patterns | No pagination anywhere in mobile: zero `.range()`, `onEndReached`, cursors. Every hook is `.limit(n)` | Keyset pagination is greenfield; the feed RPC owns it |
| `user_profiles.id` | PK is `user_id` — `supabase/migrations/20260108072000_mobile_user_accounts.sql` | Joins use `up.user_id = vp.author_id` |
| Venue owners "connect Instagram from venue settings" | Ownership is org-based: `venues.org_id` → `org_members` / `venue_members`; no `owner_id` | Connection rights resolve through `is_org_owner()`/`has_venue_assignment()`; UI lives in `apps/web/src/app/orgs/[orgId]/venues/[venueId]/page.tsx` beside the existing `instagram_url` input (~L891-900) |
| OAuth tokens "encrypted at rest (Supabase Vault)" | No `supabase_vault`, `pgsodium`, or `pgcrypto` in any migration. The only secret pattern is `private.*_job_tokens` + definer getter | Token encryption is greenfield; see §Instagram |
| Storage path `{venue_id}/{post_id}/{file}` | Both hardened buckets scope writes to `(storage.foldername(name))[1] = auth.uid()::text` — `20260518130000_avatar_storage_bucket.sql` | Path becomes `{author_uid}/{post_id}/{n}.jpg` so the proven policy applies unchanged |
| `venue-media` bucket is "already configured for venue media uploads" | It is: with no size limit, no mime allowlist, and bucket-wide `FOR ALL TO authenticated` — `20260108071500_storage_venue_media.sql` | Do not put user posts there. New bucket modelled on `user-avatars`/`guide-covers` |
| Rate limiting on create-post | `public.check_rate_limit` is `service_role`-only — `20260526045628_lock_down_check_rate_limit_execute.sql` | Posting must go through an edge function (the repo's pattern: `verify-checkin`, `send-friend-invite`) |
| Instagram permissions `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` | Instagram Basic Display API was retired 2024-12-04. `instagram_content_publish` is a **write** scope the feature never needs | Use "Instagram API with Instagram Login" and `instagram_business_basic` only (verify current scope names at app-review time) |
| Instagram webhook for new posts is the primary sync | Meta's Instagram webhooks cover comments, mentions, messages, story insights. A "new media" topic is not documented; treat as unverified | Polling is primary; a webhook, if one exists, is an accelerator |
| Guest users see the Discover feed | `REVOKE ALL ON public.user_events FROM anon` (`20260526045023_checkin_pipeline_blockers.sql:232`) — the guest branch at `ActivityScreen.tsx:527-558` reads nothing | The new feed RPC is explicitly granted to `anon`; the guest branch gets fixed by this work |
| Edge functions are a routine deploy | No CI deploys them; migrations do auto-deploy (`supabase-db-deploy.yml`) but `supabase functions deploy` is manual and documented only in runbook prose | A functions-deploy workflow ships with sub-project 1 |
| Deno tests cover edge functions | `supabase/functions/**/*.test.ts` never run; CI runs `node --test test/*.test.mjs` only | Pure logic lives in `.mjs` files importable from `test/`, per `CLAUDE.md` |
| Cloudinary transforms for feed images "free tier" | Cloudinary's AI moderation add-on is enabled on the upload preset **without a subscription** and errors uploads (`supabase/functions/import-places/README.md:122`) | Feed images stay on Supabase Storage; moderation uses Google Cloud Vision SafeSearch |
| PostHog tracks feed metrics | PostHog is initialized on web only; the mobile app has zero analytics instrumentation | Phase 1 success metrics come from SQL over the new tables (§Success metrics) |

## Decisions

Recommendations for the doc's six open questions, plus decisions the survey forced. Each is a
default; override any of them and the plan adjusts.

| # | Question | Decision | Rationale |
|---|---|---|---|
| Q1 | Moderation service | **Google Cloud Vision SafeSearch** for images + a blocklist for captions. Fail closed: if the Vision key is unset, every post lands in `pending_review` | $1.50 per 1,000 images, deterministic, returns adult/violence/racy likelihoods. AWS would add a second cloud. Cloudinary's add-on is unsubscribed. An LLM (the repo has Gemini/Anthropic wiring in `api/intake/extract`) is non-deterministic and slower; keep it as a Phase 2 option for nuanced caption review |
| Q2 | Video in Phase 1 | **Photos only.** Video arrives with TikTok embeds in Phase 3 | No `expo-av`/`expo-video`/`react-native-webview` installed; video needs a native build, moderation for video is 10-50× the cost, and the doc's own Phase 3 already carries the video player |
| Q3 | Instagram connection surface | **Web console only** (org venue page). Mobile shows connection status read-only | The OAuth redirect, Meta app review, and org-role checks all already live in the web app. Mobile venue management does not exist |
| Q4 | Feed privacy | **All UGC is public.** No follower-only posts in Phase 1 | Follower-only posts require the social graph in every read path (feed, venue page, comments) and RLS for each. The existing `venue_visits.is_private` toggle covers "don't show I was here" |
| Q5 | Venue verification before social connect | **Yes — the venue must have an org with an `owner` member**, and the connecting user must be that owner | Org ownership is the only claim mechanism; a `listed` venue with no org has nobody to authorize a token |
| Q6 | Backfill depth | **25 most recent posts, no older than 90 days** | Older content is stale for a "where tonight" decision; 25 fits one API page; the parity nightly does not care but storage cost does |
| D1 | Table layout for interactions | **Separate tables** (`post_likes`, `post_comments`, `post_reports`, `user_blocks`), not one polymorphic `post_interactions` | One table means one SELECT policy across types. Reports must not be readable by the reported author; likes are public counts. Splitting gives each its own policy, trigger, and grant |
| D2 | Who may post | **Any authenticated user**, rate-limited (5/hour, 20/day), after accepting community guidelines once | Consistent with the contribution-attribution decision to store tier as data. A `visit_id` link (optional) marks "verified visit" posts for a later trust signal |
| D3 | Comments | **Sub-project 2**, not sub-project 1 | Comments are the highest-abuse surface. Ship the feed, report, and block loop first; measure reports; then open comments |
| D4 | Tags on posts | **Dropped** | Venues already carry `tags`; post tags would need moderation and a UI with no consumer in the doc |
| D5 | System events in the feed | **Fallback, not blend.** When the first page has fewer than 5 posts, the legacy `user_events` cards render under a "Recent activity" divider | At 70 users the posts feed will be empty for weeks; the tab must never be blank. The doc's 10% blend becomes a ranking-time decision in sub-project 2 |
| D6 | Engagement counts | **Computed at read time** in the feed RPC | House pattern (`get_venue_visit_stats`). No counter-cache triggers exist; add one only if p95 feed latency exceeds 300 ms |
| D7 | Realtime | **None.** Optimistic like toggles + refresh-on-focus | `supabase.channel` has never been used; likes at this scale do not justify it |
| D8 | Native build | **Sub-projects 1 and 2 ship OTA** (no new native modules: RN `Modal` sheets, `expo-image-picker` and `expo-image-manipulator` are present). **Sub-project 4 (TikTok) needs `react-native-webview` and a store build** | `expo-updates` is in use; `ScanMenuScreen.tsx:17-21` documents the native-module trap |
| D9 | Instagram token encryption | **AES-256-GCM in the edge function** with a key in Supabase function secrets; ciphertext in `private.venue_social_connections`; a `security_invoker` public view exposes non-secret columns only | Keeps plaintext out of the database, `pg_dump`, and backups entirely. Vault would leave decrypted values one `service_role` query away and its schema is outside the parity dump |
| D10 | Admin authority for moderation | **`isAdmin()` email allowlist** (the `/admin` layout gate) | Moderation lives under `/admin/*`; every server action there calls `assertAdmin()`. Super users do not moderate |

## Security and risk analysis

Ranked by severity. "Where" cites the repo evidence; "Mitigation" is what the plan builds.

| Sev | Risk | Where | Mitigation | Sub-project |
|---|---|---|---|---|
| **Blocker** | App Store rejection under Guideline 1.2 (no filter/report/block/24h) | No report or block UI in `apps/mobile/src`; only `ListingFreshness.tsx` reports listings | SafeSearch filter, `post_reports` with auto-hide at 2 distinct reporters, `user_blocks`, support email in the report sheet, daily SLA tripwire workflow | SP1 |
| **Blocker** | Terms claim company ownership of all content; no UGC license, no acceptable-use, no takedown | `apps/directory/src/app/terms/page.tsx` IP clause; privacy §8 | Terms: user retains ownership, grants non-exclusive license, acceptable-use list, DMCA/takedown contact. Privacy: user-content section, image processing disclosure, EXIF note. In-app guidelines acceptance recorded on first post | SP1 |
| High | Malicious or oversized uploads | `venue-media` has no limits; Storage size limits are per bucket | New `venue-posts` bucket: 5 MB, `image/jpeg,png,webp` only, uid-prefix write policy, no SELECT policy (listing closed, public URLs work). Edge function re-verifies each object exists under the author's prefix before the row is created | SP1 |
| High | Post spam / flooding | `check_rate_limit` is service-role only; no client-side path can enforce it | No client INSERT policy on `venue_posts` at all. `create-post` edge function is the only writer: `check_rate_limit('post:{uid}', 5, 3600)` and `('post_day:{uid}', 20, 86400)` | SP1 |
| High | Report abuse (brigading a rival venue's posts) | Auto-hide thresholds are gameable | Partial unique index (one open report per reporter per post); threshold counts **distinct** reporters; auto-hide sets `pending_review`, never `removed`; admin can dismiss and mark the reporters; daily cap of 10 reports per user via trigger | SP1 |
| High | Reporter identity exposed to the reported author | Doc's single `post_interactions` table + one SELECT policy | Separate `post_reports` with `select` limited to `reporter_id = (select auth.uid())`; admins read via service role | SP1 |
| High | Instagram/TikTok tokens readable via PostgREST | Doc puts `access_token` in a public-schema table; default grants expose it | Table in `private` schema (inside the parity dump, outside PostgREST), ciphertext only, service-role-only grants, public `security_invoker` view without token columns | SP3 |
| High | Webhook forgery | `ingest-venues` compares a header with `!==`; no HMAC-over-raw-body precedent in Deno | Meta `X-Hub-Signature-256`: read `req.text()` first, HMAC-SHA256 with `node:crypto` (already used in `_shared/checkin-code.ts`), `timingSafeEqual` | SP3 |
| High | Over-broad OAuth scope | Doc requests `instagram_content_publish` (write) | Request read scopes only. Least privilege also shortens Meta app review | SP3 |
| Medium | Orphaned uploads (client crashed between upload and `create-post`) | Storage-first upload design | Nightly pg_cron job lists `venue-posts` prefixes older than 24 h with no `venue_posts` row and deletes them (service role) | SP2 |
| Medium | Account deletion leaves media behind | `delete-account` relies on FK cascades; storage has no cascade | `venue_posts.author_id ... on delete cascade` for rows; `delete-account` removes the `venue-posts/{uid}/` prefix before `deleteUser` | SP1 |
| Medium | Blocked user still sees blocker's content elsewhere | Blocks are new; `useFriendActivity`, `useUserSearch`, `useFriendSuggestions` predate them | Feed RPC and comments policy enforce blocks both directions in SP1; the three legacy hooks are listed as SP2 follow-ups with the exact file paths | SP1 / SP2 |
| Medium | EXIF GPS leaks a user's home | Photos from the camera roll carry location | `expo-image-manipulator` re-encodes to JPEG without EXIF; the plan pins this with a test that the uploader always passes through `manipulateAsync` | SP1 |
| Medium | Moderation queue silently unattended | All three email paths were dead simultaneously on 2026-08-12 (`EMAIL-OUTAGE-FINDINGS-2026-08-12.md`) | Do not depend on email. A scheduled GitHub workflow (the repo's tripwire pattern: `uptime.yml`, `digest-check.yml`) fails when any open report or `pending_review` post is older than 12 h; GitHub notifies on failure | SP1 |
| Medium | Instagram CDN URLs expire; copied media has licensing terms | Doc downloads media to Storage | Copy only what the API returns for the connected account, store `external_url`, show a "View on Instagram" link, delete copies on disconnect and on Meta's data-deletion callback | SP3 |
| Medium | Sync job token in `private.*_job_tokens` is plaintext | House pattern | Accepted as-is (matches 6 existing jobs); the token only authorizes invoking the sync, never reads a platform token | SP3 |
| Low | Bare `auth.uid()` in a new policy regresses initplan caching | `20260811175113_wrap_auth_calls_in_rls_policies.sql` | Every policy uses `(select auth.uid())`; a source-pinning test asserts no bare call in the new migrations | SP1 |
| Low | `USING (true)` reads or unpinned `SECURITY DEFINER` (blocking per `docs/database-change-policy.md`) | Policy | All definer functions `set search_path = public`; public read policies filter on `status = 'published'` | SP1 |
| Low | Five manual edge-function deploys with no safety net | No functions-deploy workflow | `supabase-functions-deploy.yml` on push to `master` touching `supabase/functions/**` (`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` are already repository secrets, used by `digest-check.yml`) | SP1 |

## Design

### Sub-project decomposition

Each sub-project produces working, shippable software and gets its own plan.

| SP | Name | Weeks (doc) | Ships | Native build? |
|---|---|---|---|---|
| **SP1** | UGC spine + trust & safety | 1–4 | Schema, bucket, `create-post`, feed RPC (reverse-chron keyset), `SocialPostCard`, `CreatePostSheet`, likes, report, block, admin moderation queue, SLA tripwire, Terms/Privacy/guidelines, delete-account cleanup, functions-deploy CI | No (OTA) |
| **SP2** | Engagement + ranking v1 | 4–6 | Comments, venue "Posts" section on `HappyHourDetailScreen`, ranked feed RPC with `p_as_of`, orphan-upload cleanup cron, block enforcement in legacy hooks, owner "hide post" | No (OTA) |
| **SP3** | Instagram | 5–10 | Meta app + review, `private.venue_social_connections`, `instagram-oauth-callback`, `sync-instagram` (pg_cron 6h), optional webhook, data-deletion callback, "Connect Instagram" in org venue page, source badge on cards | No |
| **SP4** | TikTok | 11–16 | TikTok app + review, `sync-tiktok` (pg_cron 12h), embed card via `react-native-webview`, token refresh | **Yes** |

The doc's week numbers are kept for reference; SP1 is heavier than the doc's Phase 1 weeks 1–2
because compliance moved forward.

### Schema (SP1)

One migration for tables and indexes, a second for RLS and grants, per
`docs/database-change-policy.md` ("RLS/grant changes in their own reviewable migration").

```sql
-- 20260908120000_social_feed_tables.sql
create table if not exists public.venue_posts (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  visit_id      uuid references public.venue_visits(id) on delete set null,
  body          text check (body is null or char_length(body) <= 500),
  media_paths   text[] not null default '{}'
                check (array_length(media_paths, 1) is null or array_length(media_paths, 1) <= 4),
  rating        smallint check (rating is null or rating between 1 and 5),
  source        text not null default 'ugc' check (source in ('ugc','instagram','tiktok')),
  external_id   text,
  external_url  text,
  status        text not null default 'published'
                check (status in ('published','pending_review','removed')),
  moderation    jsonb not null default '{}'::jsonb,   -- SafeSearch labels, blocklist hits, decided_by
  removed_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (body is not null or array_length(media_paths, 1) >= 1)
);
create index if not exists venue_posts_feed_idx   on public.venue_posts (created_at desc, id desc) where status = 'published';
create index if not exists venue_posts_venue_idx  on public.venue_posts (venue_id, created_at desc) where status = 'published';
create index if not exists venue_posts_author_idx on public.venue_posts (author_id, created_at desc);
create index if not exists venue_posts_review_idx on public.venue_posts (created_at) where status = 'pending_review';
create unique index if not exists venue_posts_external_idx on public.venue_posts (source, external_id) where external_id is not null;

create table if not exists public.post_likes (
  post_id    uuid not null references public.venue_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

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
create unique index if not exists post_reports_open_unique on public.post_reports (post_id, reporter_id) where status = 'open';
create index if not exists post_reports_open_idx on public.post_reports (created_at) where status = 'open';

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_profiles
  add column if not exists community_guidelines_accepted_at timestamptz;
-- deliberately NOT added to the authenticated column grant: only create-post (service role) sets it.
```

`post_comments` arrives in SP2 with the same shape as `post_reports` minus the review columns,
plus a per-hour trigger cap.

Triggers (all `security definer`, `set search_path = public`, `revoke ... from public, anon,
authenticated`):

- `venue_posts_set_updated_at` → `public.set_updated_at()` (house helper).
- `post_reports_auto_hide` (AFTER INSERT): when `count(distinct reporter_id)` of open reports on the
  post ≥ 2 and the post is `published`, set `status = 'pending_review'`,
  `moderation = moderation || '{"hidden_by":"reports"}'`. Mirrors `flag_disputed_on_report()`.
- `post_reports_daily_cap` (BEFORE INSERT): more than 10 reports by this reporter in 24 h → raise
  `report_rate_limited`. Mirrors `enforce_venue_visit_cooldown()`.

### RLS and grants (SP1)

```sql
-- 20260908120100_social_feed_rls.sql
alter table public.venue_posts  enable row level security;
alter table public.post_likes   enable row level security;
alter table public.post_reports enable row level security;
alter table public.user_blocks  enable row level security;

-- Visibility: published to everyone; authors always see their own rows (so a
-- pending_review post does not vanish from the author's screen).
drop policy if exists venue_posts_select_published_or_own on public.venue_posts;
create policy venue_posts_select_published_or_own on public.venue_posts
  for select to anon, authenticated
  using (status = 'published' or author_id = (select auth.uid()));
-- No INSERT or UPDATE policy: create-post (service role) is the only writer.
drop policy if exists venue_posts_delete_own on public.venue_posts;
create policy venue_posts_delete_own on public.venue_posts
  for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists post_likes_select_all on public.post_likes;
create policy post_likes_select_all on public.post_likes for select to anon, authenticated using (true);
-- (a USING (true) read is acceptable here: a like is a public count with no body; the policy
--  review in docs/database-change-policy.md flags it, so this comment is the justification.)
drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own on public.post_likes
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists post_reports_insert_self on public.post_reports;
create policy post_reports_insert_self on public.post_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
drop policy if exists post_reports_select_self on public.post_reports;
create policy post_reports_select_self on public.post_reports
  for select to authenticated using (reporter_id = (select auth.uid()));

drop policy if exists user_blocks_all_own on public.user_blocks;
create policy user_blocks_all_own on public.user_blocks
  for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

revoke all on public.venue_posts, public.post_likes, public.post_reports, public.user_blocks from anon, authenticated;
grant select on public.venue_posts to anon, authenticated;
grant delete on public.venue_posts to authenticated;
grant select on public.post_likes to anon, authenticated;
grant insert, delete on public.post_likes to authenticated;
grant select, insert on public.post_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
```

Reconsidered and rejected: a `post_likes` policy scoped to visible posts. Liking a hidden post
is harmless and the join cost lands on every feed row.

### Storage (SP1)

```sql
-- 20260908120200_venue_posts_storage_bucket.sql (storage schema is outside the parity dump)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue-posts', 'venue-posts', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;
-- insert_own / delete_own scoped to (storage.foldername(name))[1] = auth.uid()::text
-- no UPDATE policy (objects are immutable), no SELECT policy (listing closed; public URLs serve).
```

Object path: `{author_uid}/{post_id}/{n}.jpg`, `n` in 0..3. The client generates `post_id`
(`expo-crypto` is not installed; use `crypto.randomUUID()` from Hermes, present in RN 0.81).
The client resizes to a 1600 px long edge, JPEG quality 0.8, `base64: true`, then
`decode()` → ArrayBuffer — the exact `useAvatarUpload.ts:52-67` pattern, whose comment
documents that `fetch(uri).blob()` uploads empty bodies in RN.

### Edge functions (SP1)

One new function, `create-post`, plus two `_shared` modules. No `interact` function: likes,
reports, and blocks are direct PostgREST writes guarded by the policies and triggers above.

`create-post` (POST, user JWT, `verify_jwt` default):

1. Authenticate exactly as `verify-checkin/index.ts:80-98` (anon-key client with the caller's
   `Authorization` header, `auth.getUser()`).
2. Parse `{ post_id, venue_id, body?, media_paths[], rating?, visit_id?, accept_guidelines? }`.
   Reject unless every path matches `^{uid}/{post_id}/[0-3]\.jpg$` (validator in
   `_shared/post-media-path.mjs`, shared with a root test).
3. `check_rate_limit('post:{uid}', 5, 3600)` then `('post_day:{uid}', 20, 86400)` → 429
   `rate_limited` when true.
4. Venue must be `status = 'published'`. If `visit_id` given, it must belong to the caller and
   the venue.
5. Guidelines: if `user_profiles.community_guidelines_accepted_at` is null and
   `accept_guidelines !== true` → 428 `guidelines_required`; else stamp it (service role).
6. `storage.from('venue-posts').list('{uid}/{post_id}')` — every declared path must exist and be
   ≤ 5 MB; extra objects in the prefix are deleted.
7. Moderation (`_shared/moderation.mjs` decides; `_shared/safe-search.ts` calls Vision):
   - caption blocklist hit → `pending_review`
   - any image `adult`/`violence` = `VERY_LIKELY` → 422 `content_rejected`, objects deleted
   - any `LIKELY`, or `racy` = `VERY_LIKELY` → `pending_review`
   - Vision unreachable or key unset → `pending_review` (fail closed)
   - else `published`
8. Insert the row (service role) with `moderation` recording labels and the decision; return
   `{ post, status }`.

Response shape follows the house `json({ error }, status)` helper. A `_shared/http.ts` with the
CORS block and `json()` is introduced so the fourth copy of that block is the last.

### Feed algorithm

Optimized for what a HappiTime user is doing when they open Discover: deciding where to go
tonight in Kansas City. That ranks the signals differently from a general social feed.

**v0 (SP1): reverse-chronological keyset, diversity on the client.**

```sql
create or replace function public.get_discover_feed(
  p_limit int default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
) returns table (
  id uuid, venue_id uuid, venue_name text, venue_slug text, venue_neighborhood text,
  author_id uuid, author_handle text, author_display_name text, author_avatar_url text, author_role text,
  body text, media_paths text[], rating smallint, source text, external_url text,
  created_at timestamptz, like_count bigint, liked_by_me boolean, is_verified_visit boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.venue_id, v.name, v.slug, v.neighborhood,
         p.author_id, up.handle, up.display_name, up.avatar_url, up.role,
         p.body, p.media_paths, p.rating, p.source, p.external_url, p.created_at,
         (select count(*) from public.post_likes l where l.post_id = p.id),
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
         p.visit_id is not null
  from public.venue_posts p
  join public.venues v on v.id = p.venue_id and v.status = 'published'
  join public.user_profiles up on up.user_id = p.author_id
  where p.status = 'published'
    and (p_cursor_created_at is null
         or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id))
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id)
         or (b.blocker_id = p.author_id and b.blocked_id = (select auth.uid())))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke all on function public.get_discover_feed(int, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_discover_feed(int, timestamptz, uuid) to anon, authenticated;
```

`security definer` is required because the block check must see the *other* user's block rows,
which `user_blocks` RLS hides from the viewer. The function reads nothing a viewer could not
otherwise see: published posts, public profiles, like counts. The two-column keyset
`(created_at, id)` is exact and never skips or repeats. The client applies the diversity rule
within each page (no more than two consecutive cards from one venue, stable reorder that never
crosses a page boundary) — `apps/mobile/src/lib/feedPage.mjs`, tested from `test/`.

**v1 (SP2): scored ranking with a frozen clock.** Signals, in order of weight:

| Signal | Term | Why this order for HappiTime |
|---|---|---|
| Recency | `exp(-age_hours / 36)` — ~25 h half-life | A photo of last night's happy hour is the product; a week-old one is not |
| Happy hour live or imminent | `× (1 + 0.5·hh)` where `hh = 1` if the venue has a `happy_hour_windows` row active now or starting within 2 h in the venue's `timezone` | The HappiTime-specific signal: "where should I go **now**". Reads only; no window is ever written (the `touch_*` triggers fire on writes only) |
| Proximity | `× (1 + 0.4·max(0, 1 − km/8))` when the client passes `p_lat`, `p_lng`; haversine with a bbox prefilter copied from `nearest_published_venue.sql` (no PostGIS) | Single metro, so an 8 km taper separates "my side of town" from "across the river" without excluding anything |
| Social graph | `× (1 + 0.6·followed)` if viewer follows the author (`user_follows.status = 'accepted'`) | Friends' posts are the highest-intent content; friends-of-friends is a second-degree join not worth its cost at 70 users |
| Engagement | `× (1 + 0.3·ln(1 + likes + 2·comments))` | Log-damped so a single viral post cannot pin the top for days; comments weigh double because they cost more |
| Insider | `× 1.15` when `author.role = 'super_user'` | The badge already exists; a mild boost reflects the trust the program grants |
| Own posts | `× 0.7` | A user's own post should not lead their own feed |
| Diversity | client-side, unchanged | Kept out of SQL so keyset stays exact |

Pagination for a scored feed: order by `(day_bucket desc, score desc, id desc)` where
`day_bucket = date_trunc('day', created_at at time zone 'America/Chicago')`, and the client sends
`p_as_of` (the timestamp of its first page request) so age decay is computed against one frozen
instant across all pages. Like counts can still drift between pages; the client dedupes by `id`.
Venue proximity and happy-hour terms are computed per venue once per request via a CTE, so cost
stays O(posts on page + venues), not O(posts × windows).

Weights are constants at the top of the function so they can be tuned by migration. Tuning
input: `post_views` are not tracked in SP1 (no mobile analytics); the doc's "engagement velocity"
is deferred until there is engagement to measure.

### Mobile (SP1)

New files, one responsibility each:

| File | Responsibility |
|---|---|
| `apps/mobile/src/hooks/useDiscoverPosts.ts` | Calls `get_discover_feed`, keyset state, `loadMore`, `refresh`, optimistic `toggleLike`, `removePost` (after delete/block/report) |
| `apps/mobile/src/lib/feedPage.mjs` (+ `.d.ts`, `.test.mjs` in `test/`) | Pure: `mergeFeedPages`, `spreadVenues`, `cursorFrom` |
| `apps/mobile/src/lib/postMediaPath.mjs` (+ `.d.ts`) | Pure: `buildPostMediaPath(uid, postId, index)` |
| `apps/mobile/src/lib/communityGuidelines.ts` | The guidelines copy shown once before the first post |
| `apps/mobile/src/hooks/useCreatePost.ts` | Pick up to 4 images → resize → upload to `venue-posts` → invoke `create-post`; surfaces `guidelines_required`, `rate_limited`, `content_rejected` |
| `apps/mobile/src/components/feed/SocialPostCard.tsx` | Full-width card: author row (avatar, handle, `SuperUserBadge`), media (paged horizontal `FlatList` of RN `Image`, aspect 4:5), venue line (tap → `HappyHourDetail`), caption, like button, overflow menu |
| `apps/mobile/src/components/feed/PostActionsSheet.tsx` | RN `Modal` sheet (the `ListingFreshness.tsx:171-242` pattern): Report (reason list), Block user, Delete (own), with the support email line Apple requires |
| `apps/mobile/src/components/feed/CreatePostSheet.tsx` | Venue picker (search `venues` published, prefilled when opened from a venue), photo grid, caption (500), optional rating, guidelines acceptance on first post |
| `apps/mobile/src/components/feed/FeedFAB.tsx` | Absolute-positioned button on the Discover segment; guests → `requestSignIn('post')` |
| `apps/mobile/src/components/feed/DiscoverFeedCard.tsx` | The legacy card extracted verbatim from `ActivityScreen.tsx:314-352` |

`ActivityScreen.tsx` changes are confined to the `tab === "discover"` branch (L687–763) and the
guest branch (L527–558): swap data source and card, keep the Insider and Suggested-people header
rails, add the fallback footer. `lib/gatedAction.ts` gains `"post"` in `GatedActionKind`.

Images: RN `<Image>` with `resizeMode="cover"` and the public Storage URL. `expo-image` is the
better component but is a native module; it is a SP4 addition riding the TikTok build.

### Admin moderation (SP1)

`apps/web/src/app/admin/moderation/page.tsx`, modelled on `admin/suggestions/page.tsx`
(service-role read in a server component) and `admin/address-review` (client action buttons).
Two lists: **Pending review** (`venue_posts.status = 'pending_review'`, oldest first, with the
SafeSearch labels and the report reasons that hid it) and **Open reports on published posts**.
Actions in `apps/web/src/app/actions/admin-moderation-actions.ts`, each beginning with
`assertAdmin()`: `approvePost`, `removePost(reason)`, `dismissReports`, `actionReports`.
Every action writes `moderation.decided_by = <admin email>` and `decided_at`.

SLA tripwire: `.github/workflows/moderation-sla.yml` daily at 14:00 UTC (9 AM Central) runs
`scripts/check-moderation-sla.mjs`, which queries the project through the Supabase Management API
(`POST /v1/projects/{ref}/database/query`) with the existing `SUPABASE_ACCESS_TOKEN` /
`SUPABASE_PROJECT_REF` secrets — the same channel `scripts/check-digest.mjs` uses — and fails the
job when the oldest open report or `pending_review` post is older than 12 hours. No web route, no
new token, no email in the path. Apple's bar is 24 h; 12 leaves a working day of slack.

### Venue posts section (SP2)

`HappyHourDetailScreen.tsx` gains a "Posts from here" section between the hero gallery and Menu
Preview: a horizontal strip of the venue's 10 most recent published posts via
`get_venue_posts(p_venue_id, p_limit, cursor)`, and a "Post about this place" button that opens
`CreatePostSheet` with the venue prefilled. Org members can hide a post from their venue's
section (`venue_posts.hidden_by_venue_at`, UPDATE policy via `has_venue_assignment()`); hidden
posts stay in the global feed — the venue controls its page, not the community's speech.

### Instagram (SP3)

**Meta app setup (owner action, not code):** Business-type app, "Instagram API with Instagram
Login", scope `instagram_business_basic`, App Review with a screencast, Privacy Policy URL, and a
**Data Deletion Callback URL** (required; a new edge function `meta-data-deletion` that removes
the connection and its synced posts and returns the confirmation code Meta expects).

**Storage:**

```sql
create table if not exists private.venue_social_connections (
  id                 uuid primary key default gen_random_uuid(),
  venue_id           uuid not null references public.venues(id) on delete cascade,
  platform           text not null check (platform in ('instagram','tiktok')),
  platform_user_id   text not null,
  platform_username  text,
  access_token_ct    bytea not null,        -- AES-256-GCM ciphertext
  access_token_iv    bytea not null,
  refresh_token_ct   bytea, refresh_token_iv bytea,
  token_expires_at   timestamptz,
  connected_by       uuid references auth.users(id) on delete set null,
  status             text not null default 'active' check (status in ('active','expired','revoked','error')),
  last_synced_at     timestamptz, last_error text,
  created_at         timestamptz not null default now(),
  unique (venue_id, platform)
);
-- public.v_venue_social_connections (security_invoker): venue_id, platform, platform_username,
-- status, last_synced_at — readable by org members of the venue.
```

`SOCIAL_TOKEN_KEY` (32 bytes, base64) lives in edge-function secrets. Encryption via WebCrypto
`AES-GCM` in `_shared/token-crypto.ts`; the key never enters Postgres. Rotation: re-encrypt via a
one-off function invocation; document in `SECURITY_SECRETS.md`.

**Flow:** "Connect Instagram" button (org venue page, `isOwner` only) → web route
`/api/social/instagram/start?venue_id` sets a signed `state` (venue_id + user id + nonce, HMAC
with `SOCIAL_TOKEN_KEY`, 10-minute expiry) → Meta authorize → `/api/social/instagram/callback`
validates `state`, exchanges code → short-lived token → long-lived (60-day) token, encrypts, upserts
the row, enqueues an initial backfill by invoking `sync-instagram` with `{ venue_id }`.

**Sync (`sync-instagram`, pg_cron every 6 h, house job-token pattern):** for each `active`
connection: refresh the long-lived token if `token_expires_at < now() + 7 days`; `GET
/me/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count`
(first page, 25 items, `since` = last sync minus 1 day); skip `media_type = 'VIDEO'` until SP4;
skip captions that hit the blocklist; download each image to `venue-posts/instagram/{venue_id}/{ig_media_id}.jpg`
(service role; the bucket policy's uid-prefix rule only governs `authenticated`); upsert
`venue_posts` on `(source, external_id)` with `author_id` = the connecting owner,
`status = 'published'`, `created_at` = the Instagram timestamp, and like/comment counts in a new
`external_engagement jsonb` column added by the SP3 migration.
Rate budget: 40 venues × 4 syncs/day × ~3 calls = 480 calls/day, under the 200/user/hour cap.

Consecutive failures ≥ 3 → `status = 'error'`, surfaced on the org venue page and in the daily
`send-venue-digest` (the one email path currently proven to deliver).

**Card:** `SocialPostCard` shows a small Instagram glyph and "View on Instagram" (`external_url`)
instead of the like button; likes on synced posts are disabled to avoid implying HappiTime likes
sync back.

### TikTok (SP4)

TikTok Display API (`user.info.basic`, `video.list`), 24-hour access tokens with 365-day refresh
tokens, no webhooks, 100 `video.list` calls/day/user. `sync-tiktok` runs every 12 h, refreshes
tokens each run, stores nothing but the share URL (`media_paths = []`,
`external_url` = share URL, new `media_kind = 'embed'`). The card renders TikTok's oEmbed HTML in
`react-native-webview`, lazily when within one viewport (`onViewableItemsChanged`). This is the
one sub-project requiring a store build; it should ride whatever the next native release is.

### Operations

- **CI:** `.github/workflows/supabase-functions-deploy.yml` deploys changed functions on push to
  `master` (`supabase functions deploy <name> --project-ref `). The
  `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` secrets already exist (`digest-check.yml`
  uses them), so no owner action is needed.
- **`supabase/config.toml`:** `create-post` keeps `verify_jwt` default (true); sync and callback
  functions set `verify_jwt = false` and check their own token/signature, matching the eight
  existing entries.
- **Types:** after each migration, `supabase start && supabase db reset && npm run
  supabase:gen-types`, then add `VenuePost`, `PostLike`, `PostReport`, `UserBlock` aliases in
  `packages/shared-types/index.ts`.
- **Monitoring:** the SLA tripwire above; `sync-instagram` writes `last_error` and the
  digest reports connections in `error`.

## Non-goals

- Follower-only or private posts (Q4).
- Post tags (D4), hashtags, mentions, or link previews.
- Video upload by users (Q2); TikTok embeds are the only video.
- Learned ranking, engagement-velocity signals, or view tracking (no mobile analytics yet).
- Realtime like/comment updates (D7).
- Instagram content publishing, comment sync, or DM features.
- A public web feed. The directory site stays venue-first; posts appear there only if a later
  spec asks for it.

## Testing

Per `CLAUDE.md`, tests are pure-logic `.mjs` under `test/` plus source-pinning tests that read
SQL/TS. Rendering is verified by rendering.

| Test file | Pins |
|---|---|
| `test/social-feed-schema.test.mjs` | Tables, check constraints, partial indexes, `on delete cascade` on `author_id`, no bare `auth.uid()`, every policy name, grants list exactly, `set search_path` on every definer function |
| `test/social-feed-storage.test.mjs` | Bucket limits and mime list; no UPDATE or SELECT policy on `venue-posts` objects |
| `test/social-feed-page.test.mjs` | `mergeFeedPages` dedupes by id and preserves order; `spreadVenues` never yields 3 consecutive same-venue cards and never moves an item more than 2 slots; `cursorFrom` returns the last item's `(created_at, id)` |
| `test/post-media-path.test.mjs` | Builder output satisfies the edge validator; validator rejects other users' prefixes, path traversal, a fifth image, non-jpg |
| `test/moderation-decision.test.mjs` | Every branch of `decideModeration`, including "no Vision result → pending_review" |
| `test/create-post-source.test.mjs` | The function calls `check_rate_limit` twice with the documented keys, lists the storage prefix before insert, never inserts with `status = 'published'` when `moderation.provider = 'none'` |
| `test/create-post-uploader.test.mjs` | `useCreatePost.ts` passes every asset through `manipulateAsync` with `base64: true` and never calls `fetch(uri).blob()` |
| `test/admin-moderation-actions.test.mjs` | Every exported action begins with `assertAdmin()` (the `admin-manage-actions.ts` gap is the cautionary tale) |
| `test/delete-account-posts.test.mjs` | `delete-account` removes the `venue-posts/{uid}/` prefix before `deleteUser` |

Manual verification before merge (recorded in the PR): post a photo from a physical iPhone,
see it in the feed on a second account, report it twice from two accounts, confirm it disappears
and appears in `/admin/moderation`, approve it, confirm it returns; block the author from the
second account and confirm the feed drops their posts.

## Success metrics

The doc's targets, measured with SQL until mobile analytics exist:

```sql
-- posts per day by source (target SP1: 5–10/day)
select date_trunc('day', created_at) d, source, count(*) from public.venue_posts
 where status = 'published' group by 1, 2 order by 1 desc;
-- engagement rate: likes per published post over the last 7 days (target 8–12%)
select count(l.*)::float / nullif(count(distinct p.id), 0)
  from public.venue_posts p left join public.post_likes l on l.post_id = p.id
 where p.created_at > now() - interval '7 days';
-- report rate and moderation SLA
select count(*) filter (where status = 'open'), max(now() - created_at) filter (where status = 'open')
  from public.post_reports;
```

Scroll depth and D7 retention need mobile instrumentation; adding PostHog to mobile is a separate
decision and is listed as an open question.

## Cost

The doc's Phase 1 estimate ($25–55/mo) holds, with one change: Cloudinary transforms drop to $0
(images are served from Storage at upload size) and Vision SafeSearch replaces "content moderation
API" at ~$1.50 per 1,000 images — under $1/mo at the doc's 5–10 posts/day.

## Open questions for Juan

1. Support contact for the report sheet and Terms takedown clause: `admin@happitime.biz` is
   draft-only for outbound; is it monitored for inbound?
2. Auto-deploying edge functions from `master` on merge (using the existing `SUPABASE_ACCESS_TOKEN`
   secret) — acceptable, or keep functions deploys manual?
3. Google Cloud Vision: enable the API on the existing Google Cloud project (the one holding
   the Places/Geocoding keys) or a separate one?
4. Mobile analytics (PostHog) — in scope for SP2, or a separate spec?
5. Should Insider (super user) posts get the mild ranking boost (D-table, v1), or stay
   badge-only like itineraries today?

## Sequencing note

SP1 must land before any App Store build that exposes the feed. The Terms/Privacy page changes
(`apps/directory`) deploy on Vercel independently of the mobile OTA and must go first so the
in-app guidelines link resolves. The uncommitted `useActivityDeepLink` work on `master` touches
`AppNavigator.tsx` only and does not conflict with the Discover-branch edits in `ActivityScreen.tsx`.
