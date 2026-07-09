# Super-User Author Socials — Design

**Date:** 2026-07-07
**Status:** Approved (pending spec review)

## Summary

Let super users save their social links once (an onboarding step on the website),
and have those links appear as an **author byline** on every guide they publish at
`/guides/[slug]`. Today the public guide page shows no author information at all, and
`user_profiles` has no social fields.

"Making a post on the website" maps to the **Guides** editorial flow — the only
web content-creation surface. Guide authoring is already gated to `role = 'super_user'`,
so every guide author is a super user.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Social fields | `instagram_url`, `tiktok_url`, `website_url`, `youtube_url` (no X/Twitter, no Facebook) |
| Onboarding | Dismissible dashboard banner **+** a dedicated settings page |
| Display | Author byline block (avatar + display name + social pill links) on the public guide page |
| Join model | **Live join** on `author_id` — retroactive; edits propagate to all published guides |
| Byline visibility | Rendered only when the author has **≥1** social link filled |
| View predicate | Author has **≥1 published guide** (NOT `is_public`) |

## Architecture

Four units, each independently understandable and testable:

### 1. Data layer — new profile columns

Add to `user_profiles` (all `text`, nullable):
`instagram_url`, `tiktok_url`, `website_url`, `youtube_url`.

- Forward migration (`supabase/migrations/<ts>_user_profile_socials.sql`), matching the
  venue pattern in `20260506120000_venue_social_links.sql`.
- Regenerate `supabase/types/generated.ts`.
- **No change** to `user_profiles` RLS — public read is handled by the scoped view below,
  not by widening the table's policies.

### 2. Public read — scoped view granted to `anon`

Create view `public_guide_authors`:

```
select up.id as author_id,
       up.display_name, up.avatar_url,
       up.instagram_url, up.tiktok_url, up.website_url, up.youtube_url
from user_profiles up
where exists (
  select 1 from guides g
  where g.author_id = up.id and g.status = 'published'
);
grant select on public_guide_authors to anon;
```

- Predicate keys on **published guides**, so a super user with a private profile still
  gets a byline.
- Only exposes name/avatar/socials — no email, role, or other profile columns.
- After migration: run `get_advisors` (security lint) and confirm zero schema drift +
  Node-20 CI green.

### 3. Onboarding — banner + settings page (web app, super-user only)

**Settings page** — new route `apps/web/src/app/dashboard/profile/page.tsx`:
- Server Component; loads the current user's four social fields via `createClient()`
  (`@/utils/supabase/server`), following the existing dashboard page pattern.
- "Your socials" form: four `type="url"` inputs (Instagram, TikTok, Website, YouTube),
  saved via a Server Action in `apps/web/src/app/actions/` (new
  `profile-actions.ts` or extend an existing actions file).
- **Server Action validation** (closes the gap the venue fields left open):
  trim; empty → `null`; otherwise require an `http(s)://` URL and **reject** any other
  scheme (`javascript:`, `data:`, etc.). Persist only validated values.
- Gate the page to super users (redirect otherwise), consistent with existing role gating
  (`middleware.ts`, `dashboard/referrals/layout.tsx`).

**Banner** — on the dashboard landing (`apps/web/src/app/dashboard/page.tsx`):
- Shown only to super users whose four social fields are **all empty**.
- Copy: "Add your socials so they appear on your guides →", links to `/dashboard/profile`.
- Dismissible; dismissal persisted (e.g., a `socials_prompt_dismissed_at` column on
  `user_profiles`) so it does not nag on every load. **Chosen:** a nullable
  `socials_prompt_dismissed_at timestamptz` column on `user_profiles`, so dismissal
  survives across devices. It is added by the same migration as the social columns.

### 4. Display — author byline on the public guide page

In `apps/directory/src/app/guides/[slug]/page.tsx`:
- `getGuide` also selects `author_id`.
- A second anon query fetches the row from `public_guide_authors` by `author_id`.
- Render an `AuthorByline` component below the guide `<header>`: avatar + display name +
  a row of social pill links (Instagram / TikTok / Website / YouTube).
- **Render only when ≥1 social link is present.** If the author has no socials (or no
  matching view row), render nothing — existing guides stay visually unchanged.
- Anchors use `target="_blank" rel="nofollow ugc noopener noreferrer"` (tighter than the
  existing venue links, because these are user-controlled on a public SEO-indexed page).

## Data flow

```
Super user → /dashboard/profile form → profile-actions (validate https-only)
          → user_profiles.{instagram,tiktok,website,youtube}_url

Public visitor → /guides/[slug] → getGuide (guide + author_id)
             → public_guide_authors[author_id] (anon-granted view)
             → AuthorByline (only if ≥1 link)
```

## Error / edge handling

- **Non-super user hits `/dashboard/profile`** → redirect, matching existing gating.
- **Invalid URL scheme submitted** → Server Action rejects that field (stores `null` /
  surfaces a form error); never persists a non-http(s) value.
- **Author has no view row** (no published guide yet, or all socials empty) → byline
  simply not rendered.
- **Malformed / dead social URL** → rendered as-is (opaque to us); `nofollow ugc` limits
  SEO/abuse exposure.

## Testing

- **Migration/view:** author with a published guide + ≥1 social appears in
  `public_guide_authors`; author with only draft guides does not; private-profile author
  with a published guide DOES appear.
- **Server Action:** `https://…` accepted; `javascript:alert(1)` rejected; empty → `null`.
- **Banner:** shows when all four empty, hidden after any link saved / after dismissal.
- **Byline:** renders with ≥1 link; absent with zero links; links carry
  `rel="nofollow ugc noopener noreferrer"`.
- **Gate:** non-super user redirected from `/dashboard/profile`.

## Out of scope (YAGNI)

- X/Twitter and Facebook fields.
- Socials on non-super-user profiles or on mobile.
- Snapshotting socials per guide (live join chosen).
- A public author profile page (only the byline on guides).

## Key files

| Concern | Path |
|---|---|
| Migration | `supabase/migrations/<ts>_user_profile_socials.sql` |
| Types | `supabase/types/generated.ts` |
| Settings page | `apps/web/src/app/dashboard/profile/page.tsx` (new) |
| Server Action | `apps/web/src/app/actions/profile-actions.ts` (new) |
| Banner | `apps/web/src/app/dashboard/page.tsx` |
| Byline | `apps/directory/src/app/guides/[slug]/page.tsx` + `AuthorByline` component (new) |
| Pattern refs | venue socials `20260506120000`, venue link render in `kc/[neighborhood]/[slug]/page.tsx` |
