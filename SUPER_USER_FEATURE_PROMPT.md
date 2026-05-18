# Claude Code prompt — Super User feature batch

Paste this verbatim into Claude Code from inside `/Users/juanwilliams/Documents/GitHub/HappiTime`.

---

You are implementing an approved feature batch for HappiTime (Next.js web admin + Expo React Native mobile + Supabase backend). The plan has been pressure-tested at the boardroom level; do not redesign it. Your job is execution.

Repo layout (relevant paths, already exist):
- `apps/web` — Next.js admin/portal at `/admin`
- `apps/directory` — Next.js public marketing site, current static guides at `apps/directory/src/app/guides/*`
- `apps/mobile` — Expo React Native consumer app, onboarding in `src/onboarding/`
- `supabase/migrations/` — 51 migrations to date
- `packages/shared-types`, `packages/shared-api`, `packages/shared-env`

Existing schema (do NOT recreate):
- `user_profiles(user_id pk, handle unique, display_name, avatar_url, bio, is_public default false, created_at, updated_at)`
- `user_preferences` — has onboarding state machine: `welcome → location → preferences → notifications → profile → complete`
- `user_follows(follower_id, following_user_id)` — directed graph
- `user_lists` — itineraries, with `visibility` in (`private`,`public`,`unlisted`)
- `user_events` — activity stream
- `admin_users` — separate allowlist for portal admins (Super Admin), service-role gated
- `handle_new_user()` trigger seeds `user_profiles` from `auth.users`

## Feature scope (everything below is approved — do not relitigate)

Build these in order. Each numbered item is its own branch + PR.

### 1. Single migration: schema foundation

Create one new migration `supabase/migrations/<timestamp>_super_users_and_guides.sql` that:

- Adds `user_profiles.role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','super_user'))`.
- Adds `user_profiles.auto_publish_enabled boolean NOT NULL DEFAULT false`.
- Adds partial index `user_profiles_role_idx ON user_profiles(role) WHERE role = 'super_user'`.
- Adds prefix index `user_profiles_handle_prefix_idx ON user_profiles (handle text_pattern_ops)`.
- Backfills all existing rows: `UPDATE user_profiles SET is_public = true`. Also changes the column default to `true` going forward.
- Creates `guides` table:
  - `id uuid pk`, `slug text unique not null`, `title text not null`, `subtitle text`, `cover_image_url text`, `body_md text not null`, `author_id uuid references auth.users(id)`, `status text default 'draft' check (status in ('draft','pending_review','published','archived'))`, `city text`, `neighborhood text`, `tags text[] default '{}'`, `published_at timestamptz`, `created_at`, `updated_at`.
  - RLS: anon SELECT where `status='published'`; author full CRUD on own; Super Admin (member of `admin_users`) full access.
- Creates `guide_submissions` table for approval audit log:
  - `id uuid pk`, `guide_id uuid references guides(id) on delete cascade`, `submitted_by uuid references auth.users(id)`, `submitted_at timestamptz default now()`, `reviewed_by uuid references auth.users(id)`, `reviewed_at timestamptz`, `decision text check (decision in ('approved','rejected','unpublished'))`, `notes text`.
- Creates `pending_friend_invites` table:
  - `id uuid pk`, `inviter_id uuid not null references auth.users(id)`, `invitee_handle text`, `invitee_email text not null`, `status text default 'pending' check (status in ('pending','claimed','expired','cancelled'))`, `invite_token uuid default gen_random_uuid()`, `created_at timestamptz default now()`, `claimed_at timestamptz`, `expires_at timestamptz default (now() + interval '30 days')`.
  - Index on `invitee_email where status='pending'`.
- Updates `user_preferences` onboarding step CHECK constraint to include `'handle'` between `'notifications'` and `'profile'`.
- Extends `handle_new_user()` trigger so that on new user insert it:
  1. Looks up any `pending_friend_invites` matching the new user's `auth.users.email` with `status='pending'`.
  2. For each match, inserts mutual rows into `user_follows` (both directions: inviter→new and new→inviter).
  3. Marks the invite `status='claimed'`, sets `claimed_at = now()`.
- Adds a trigger that prevents handles in the reserved list (see below) from being inserted/updated unless the action is performed by service_role.

Run `npm run build` or equivalent in `apps/web` and `apps/mobile` after migration to regenerate Supabase types (`packages/shared-types`).

### 2. Storage bucket for avatars

In a follow-up migration: create `user-avatars` bucket. RLS:
- Public read.
- Authenticated insert/update/delete only on path `${auth.uid()}/*`.
- 1 MB size limit.

### 3. Reserved handle list

Create `packages/shared-types/src/reserved-handles.ts` exporting `RESERVED_HANDLES: Set<string>`. Categories: brand/product, role/system, generic app terms, Tier 1 cities, KC neighborhoods, abuse seed, partner-reserved (gary_mitchell, tgihh, captiview, alby, soccer_city_kc). Use the list saved in the project memory file `project_super_user_feature_plan.md` and `reference_reserved_handles.md` as the source of truth. Layer the `bad-words` npm package as a second-pass profanity filter.

Enforce both in app validation AND in the DB trigger from step 1.

### 4. Admin "Users" page in apps/web

- Route: `apps/web/src/app/admin/users/page.tsx`.
- Gated by existing `admin_users` allowlist (Super Admin only).
- Server action in `apps/web/src/actions/admin-user-actions.ts`:
  - `promoteToSuperUser(userId)` / `revokeSuperUser(userId)`.
  - `toggleAutoPublish(userId, enabled)`.
- Table view: handle, display_name, role, auto_publish_enabled, created_at. Search/filter.

### 5. Super User authoring routes in apps/web

- Authentication: same Supabase auth as mobile. Add middleware in `apps/web/middleware.ts` to gate `/guides/*` (authoring) and `/dashboard/guides/*` by checking `user_profiles.role IN ('super_user') OR user in admin_users`.
- Routes:
  - `apps/web/src/app/dashboard/guides/page.tsx` — list of own guides + status.
  - `apps/web/src/app/dashboard/guides/new/page.tsx` — markdown editor (`@uiw/react-md-editor`).
  - `apps/web/src/app/dashboard/guides/[id]/edit/page.tsx`.
- Server actions:
  - `submitGuide(id)` — sets status to `pending_review` (unless author's `auto_publish_enabled = true`, in which case sets `status='published'`, `published_at=now()`); writes a row to `guide_submissions`.
  - `saveDraft(id, fields)`.
- On submission email Super Admin (use whatever email provider is already wired; Resend recommended). Subject: `New Guide submission from @<handle>: <title>`.

### 6. Super Admin approval queue in apps/web

- Route: `apps/web/src/app/admin/guides/page.tsx`.
- Lists guides with `status='pending_review'`. Plus a tab for `status='published'` (so Super Admin can unpublish).
- Actions: approve (`status='published'`, `published_at=now()`), reject (status back to `draft` with notes), unpublish.
- Writes a row to `guide_submissions` on each decision.

### 7. Directory dynamic /guides route

- New route `apps/directory/src/app/guides/[slug]/page.tsx`.
- `generateStaticParams` reads from `guides` table where `status='published'`.
- ISR: `export const revalidate = 3600`.
- Render markdown server-side (use `react-markdown` or `next-mdx-remote`).
- Update `sitemap.xml` to include dynamic guides.
- Add `apps/directory/src/app/guides/page.tsx` to list all published guides.

### 8. Migrate existing static guides into DB

- Read each existing file under `apps/directory/src/app/guides/<slug>/page.tsx`.
- Extract title, body, slug.
- Write a one-time data migration script `scripts/migrate-static-guides-to-db.ts` that inserts each into the `guides` table with `status='published'`, `author_id = NULL` (or a dedicated Super Admin user — ask user which they prefer; default to the first row in `admin_users`).
- After verifying the dynamic route renders identically, delete the static files.
- Keep the slug 1:1 so SEO is preserved.

### 9. Mobile: avatar upload

- Use existing `expo-image-picker` (verify in `apps/mobile/package.json`; add if missing).
- Add `expo-image-manipulator` for square crop + resize to 512×512 webp.
- Upload to `user-avatars/${userId}/avatar-${timestamp}.webp` via supabase client.
- Update `user_profiles.avatar_url`.
- UI: add to `apps/mobile/src/screens/ProfileScreen.tsx` (or wherever profile editing lives — `find apps/mobile/src/screens -iname "*profile*"`).

### 10. Mobile: handle onboarding step

- Insert new step `'handle'` between `'notifications'` and `'profile'` in `apps/mobile/src/onboarding/state.ts`.
- New screen component validating: 3–20 chars, alphanumeric + underscore, lowercased, not in `RESERVED_HANDLES`, unique in DB (Supabase RPC or direct select).
- Strip leading `@` on input before validation/storage.
- Render `@` as a non-editable prefix inside the input field.
- On taken/reserved, suggest 3 alternatives (`<handle>1`, `<handle>_kc`, `<handle>_xx`).
- Force existing users without a handle through a one-time gate at app open.

### 11. Mobile: Super User badge

- Component: `apps/mobile/src/components/SuperUserBadge.tsx`.
- Visual: wine-colored filled circle (use existing HappiTime brand wine color — check `apps/mobile/src/theme/colors.ts`).
- Render conditionally where `profile.role === 'super_user'`:
  - Profile screen header
  - Activity feed item byline
  - Itinerary detail author line
  - Follower/following lists
  - Search results

### 12. Mobile: search users by handle

- New hook `apps/mobile/src/hooks/useUserSearch.ts`.
- Query: `user_profiles where is_public=true AND handle ILIKE $1 || '%' ORDER BY (handle = $1) DESC, (role = 'super_user') DESC, handle LIMIT 20`.
- Strip leading `@` from query before matching.
- New search UI surface (or extend the existing search screen — locate first).

### 13. Mobile Discover: surface Super User itineraries

- Extend `apps/mobile/src/hooks/useDiscoverActivity.ts` (or add a parallel hook) to also fetch:
  ```
  user_lists where visibility='public' 
  joined to user_profiles where role='super_user'
  order by user_lists.updated_at desc
  limit 20
  ```
- Merge into Activity feed under a section header like "From HappiTime Insiders" or "Featured itineraries".
- Verify RLS on `user_lists` allows authenticated read of public lists; add policy if missing.

### 14. Invite-by-handle, email delivery

- In mobile invite UI: try to resolve handle → user via `user_profiles`. If found, send normal friend request. If not, prompt for invitee's email.
- Insert row into `pending_friend_invites`.
- Trigger transactional email with deep link containing `invite_token`. Subject: `@<inviter_handle> invited you to HappiTime`.
- The `handle_new_user()` trigger updated in step 1 handles the auto-friend on signup.
- Rate-limit: max 20 pending invites per user per 24h (use existing `api_rate_limits` table).

## Constraints

- Make the migrations idempotent (`IF NOT EXISTS` etc.).
- Add RLS to every new table. Never grant anon write access.
- All handles stored lowercased without `@`. Always display as `@handle`.
- Build a `<Handle>` component once and reuse it everywhere (mobile + web).
- Use TypeScript strict mode. Regenerate `packages/shared-types` after migrations.
- Don't break existing static guide URLs — slugs must be preserved across the migration.
- Don't add an `@` to stored data anywhere.
- Tests: add at minimum integration tests for the auto-friend trigger, handle reservation enforcement, and the approval flow state machine.

## When you're done

Open a PR per numbered item above. The first PR (migration) should land before everything else. Final summary should include: tables created, RLS policies added, files touched per app, and any caveats for the next session.

## Read these in the repo before starting

- `DB_SCHEMA.md`
- `RLS.md`
- `MIGRATIONS.md`
- `apps/web/src/app/admin/page.tsx` and `apps/web/src/actions/admin-user-actions.ts`
- `apps/mobile/src/onboarding/state.ts`
- `apps/mobile/src/hooks/useDiscoverActivity.ts`
- `supabase/migrations/20260108072000_mobile_user_accounts.sql` (the `handle_new_user` trigger you'll extend)
- `supabase/migrations/20260515151616_mobile_onboarding_state.sql` (the onboarding step CHECK constraint you'll extend)
- `supabase/migrations/20260429120000_admin_users.sql`
