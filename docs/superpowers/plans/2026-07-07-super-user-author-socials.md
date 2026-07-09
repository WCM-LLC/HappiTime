# Super-User Author Socials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let super users save social links once (onboarding) and show them as an author byline on every guide they publish at `/guides/[slug]`.

**Architecture:** Four new/edited units. New nullable columns on `user_profiles` hold the socials + a banner-dismissal timestamp. A `security_invoker=off` view `public_guide_authors`, granted to `anon`, exposes name/avatar/socials only for users with ≥1 published guide. The web app gets a super-user-gated settings page + a dashboard nudge banner writing via a Server Action (with https-only validation). The directory app's public guide page live-joins the view and renders a byline when ≥1 link exists.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase Postgres (migrations via Supabase MCP `apply_migration`), TypeScript, Tailwind design tokens. Pure logic tested with `node --test` `.mjs` (mirrors `apps/mobile/src/lib/*.test.mjs`); the Next apps have no other test harness.

## Global Constraints

- **Migrations:** forward-only; keep zero drift (local == remote). Apply via Supabase MCP `apply_migration`; commit the identical SQL file under `supabase/migrations/`. Run `get_advisors` (type `security`) after — a view exposing profile columns to `anon` is exactly what the linter flags; resolve or justify.
- **Done bar:** `npm run typecheck` and `npm run lint` clean; GitHub CI green on Node 20 (local pass ≠ CI pass).
- **Types:** after schema change, regenerate `supabase/types/generated.ts` (Supabase MCP `generate_typescript_types`, or `npm run supabase:gen-types` if local stack is up). Do not hand-drift it.
- **Social fields (exact names):** `instagram_url`, `tiktok_url`, `website_url`, `youtube_url`. No X/Twitter, no Facebook.
- **`user_profiles` PK is `user_id`** (there is NO `id` column); `user_id` == auth uid == `guides.author_id`.
- **Server Actions live in `apps/web/src/actions/`** (NOT `app/actions/`, which only holds `media.ts`).
- **Public byline links:** `target="_blank" rel="nofollow ugc noopener noreferrer"`.
- **No RLS change** to `user_profiles`; public read is via the scoped view only.

---

### Task 1: Migration — profile columns + banner-dismissal + public view

**Files:**
- Create: `supabase/migrations/20260707120000_user_profile_socials.sql`
- Modify (regenerate): `supabase/types/generated.ts`

**Interfaces:**
- Produces: columns `user_profiles.{instagram_url,tiktok_url,website_url,youtube_url,socials_prompt_dismissed_at}`; view `public_guide_authors(author_id, display_name, avatar_url, instagram_url, tiktok_url, website_url, youtube_url)` selectable by `anon`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260707120000_user_profile_socials.sql`:

```sql
-- Super-user author socials + onboarding banner dismissal
alter table user_profiles
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists website_url text,
  add column if not exists youtube_url text,
  add column if not exists socials_prompt_dismissed_at timestamptz;

-- Public read surface for guide-author bylines. Exposes ONLY name/avatar/socials,
-- and ONLY for users who have >=1 published guide. Keyed on published guides, NOT
-- is_public, so a private-profile super user still gets a byline.
create or replace view public_guide_authors
with (security_invoker = off) as
  select
    up.user_id as author_id,
    up.display_name,
    up.avatar_url,
    up.instagram_url,
    up.tiktok_url,
    up.website_url,
    up.youtube_url
  from user_profiles up
  where exists (
    select 1 from guides g
    where g.author_id = up.user_id
      and g.status = 'published'
  );

grant select on public_guide_authors to anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP `apply_migration` with name `user_profile_socials` and the SQL above (identical to the committed file).

- [ ] **Step 3: Verify columns + view exist and anon can read**

Run via Supabase MCP `execute_sql`:

```sql
select column_name from information_schema.columns
where table_name = 'user_profiles'
  and column_name in ('instagram_url','tiktok_url','website_url','youtube_url','socials_prompt_dismissed_at')
order by column_name;
-- Expected: 5 rows.

select has_table_privilege('anon','public_guide_authors','select') as anon_can_read;
-- Expected: anon_can_read = true.
```

- [ ] **Step 4: Verify the view predicate (published-only, private-profile ok)**

Run via `execute_sql`:

```sql
-- Should return authors that have >=1 published guide, and nothing for draft-only authors.
select author_id, display_name from public_guide_authors limit 5;

-- Cross-check: count published-guide authors two ways; numbers must match.
select
  (select count(*) from public_guide_authors) as via_view,
  (select count(distinct author_id) from guides where status = 'published' and author_id is not null) as via_guides;
-- Expected: via_view == via_guides.
```

- [ ] **Step 5: Run security advisors**

Run Supabase MCP `get_advisors` with type `security`. Expected: no NEW critical finding introduced by `public_guide_authors` beyond the known "view exposes columns to anon" note (which is intentional and scoped). If a genuinely new issue appears, resolve before commit.

- [ ] **Step 6: Regenerate types**

Regenerate `supabase/types/generated.ts` (Supabase MCP `generate_typescript_types`, or `npm run supabase:gen-types`). Confirm the four `*_url` fields + `socials_prompt_dismissed_at` now appear under `user_profiles`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260707120000_user_profile_socials.sql supabase/types/generated.ts
git commit -m "feat(db): user_profile socials + public_guide_authors view"
```

---

### Task 2: URL normalizer (pure, TDD)

**Files:**
- Create: `apps/web/src/lib/socialUrl.mjs`
- Test: `apps/web/src/lib/socialUrl.test.mjs`

**Interfaces:**
- Produces: `normalizeSocialUrl(input) -> { ok: true, value: string | null } | { ok: false, error: string }`. `null` value means "cleared" (empty input). Rejects any non-http(s) scheme.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/socialUrl.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSocialUrl } from "./socialUrl.mjs";

test("empty / whitespace clears to null", () => {
  assert.deepEqual(normalizeSocialUrl(""), { ok: true, value: null });
  assert.deepEqual(normalizeSocialUrl("   "), { ok: true, value: null });
  assert.deepEqual(normalizeSocialUrl(null), { ok: true, value: null });
});

test("https url passes through trimmed", () => {
  assert.deepEqual(
    normalizeSocialUrl("  https://instagram.com/me  "),
    { ok: true, value: "https://instagram.com/me" }
  );
});

test("bare domain gets https:// prefix", () => {
  assert.deepEqual(
    normalizeSocialUrl("instagram.com/me"),
    { ok: true, value: "https://instagram.com/me" }
  );
});

test("http is upgraded to https", () => {
  assert.deepEqual(
    normalizeSocialUrl("http://example.com"),
    { ok: true, value: "https://example.com/" }
  );
});

test("javascript scheme is rejected", () => {
  const r = normalizeSocialUrl("javascript:alert(1)");
  assert.equal(r.ok, false);
});

test("data scheme is rejected", () => {
  const r = normalizeSocialUrl("data:text/html,<script>");
  assert.equal(r.ok, false);
});

test("garbage that cannot form a URL is rejected", () => {
  const r = normalizeSocialUrl("not a url at all");
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/lib/socialUrl.test.mjs`
Expected: FAIL — cannot find module `./socialUrl.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/socialUrl.mjs`:

```js
// Normalizes a user-entered social/website URL for safe public rendering.
// Returns { ok:true, value:string|null } (null == cleared) or { ok:false, error }.
export function normalizeSocialUrl(input) {
  const raw = (input ?? "").toString().trim();
  if (!raw) return { ok: true, value: null };

  // Prepend scheme if the user typed a bare domain (no scheme present).
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http(s) links are allowed." };
  }
  // Force https for public display safety.
  url.protocol = "https:";
  if (!url.hostname.includes(".")) {
    return { ok: false, error: "Enter a valid URL." };
  }
  return { ok: true, value: url.toString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/lib/socialUrl.test.mjs`
Expected: PASS (7 tests).

Note: `"https://instagram.com/me"` stays as-is (no trailing slash added because it has a path); `"http://example.com"` becomes `"https://example.com/"` (WHATWG URL adds the root slash). The tests above match this behavior exactly.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/socialUrl.mjs apps/web/src/lib/socialUrl.test.mjs
git commit -m "feat(web): add normalizeSocialUrl (https-only) with tests"
```

---

### Task 3: Server Action — save socials + dismiss banner

**Files:**
- Create: `apps/web/src/actions/profile-actions.ts`

**Interfaces:**
- Consumes: `normalizeSocialUrl` from `@/lib/socialUrl.mjs`; `createClient` from `@/utils/supabase/server`.
- Produces: `saveProfileSocials(formData: FormData): Promise<void>` (redirects back with `?ok=1` or `?error=<msg>`); `dismissSocialsPrompt(): Promise<void>`.

- [ ] **Step 1: Write the Server Action**

Create `apps/web/src/actions/profile-actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { normalizeSocialUrl } from '@/lib/socialUrl.mjs';

const PROFILE_PATH = '/dashboard/profile';
const FIELDS = ['instagram_url', 'tiktok_url', 'website_url', 'youtube_url'] as const;

export async function saveProfileSocials(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/super-user/login');

  const patch: Record<string, string | null> = {};
  for (const field of FIELDS) {
    const result = normalizeSocialUrl(formData.get(field) as string | null);
    if (!result.ok) {
      redirect(`${PROFILE_PATH}?error=${encodeURIComponent(`${field}: ${result.error}`)}`);
    }
    patch[field] = result.value;
  }

  const { error } = await supabase
    .from('user_profiles')
    .update(patch)
    .eq('user_id', auth.user.id);

  if (error) redirect(`${PROFILE_PATH}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(PROFILE_PATH);
  redirect(`${PROFILE_PATH}?ok=1`);
}

export async function dismissSocialsPrompt(): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  await supabase
    .from('user_profiles')
    .update({ socials_prompt_dismissed_at: new Date().toISOString() })
    .eq('user_id', auth.user.id);

  revalidatePath('/dashboard');
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace web`
Expected: no errors referencing `profile-actions.ts`. (Requires Task 1's regenerated types so the new columns are known.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/actions/profile-actions.ts
git commit -m "feat(web): saveProfileSocials + dismissSocialsPrompt server actions"
```

---

### Task 4: Settings page `/dashboard/profile` (super-user gated)

**Files:**
- Create: `apps/web/src/app/dashboard/profile/page.tsx`
- Create: `apps/web/src/app/dashboard/profile/layout.tsx`
- Modify: `apps/web/src/utils/auth-paths.ts` (add `PROFILE_PATH` to `SUPER_USER_PATHS`)

**Interfaces:**
- Consumes: `saveProfileSocials` from `@/actions/profile-actions`; `createClient`; `isAdmin` from `@/utils/admin`.

- [ ] **Step 1: Gate the path in middleware config**

In `apps/web/src/utils/auth-paths.ts`, add a constant and include it in `SUPER_USER_PATHS`:

```ts
export const PROFILE_PATH = '/dashboard/profile';
```

Then change:

```ts
const SUPER_USER_PATHS = [GUIDE_AUTHORING_PATH, REFERRALS_PATH];
```

to:

```ts
const SUPER_USER_PATHS = [GUIDE_AUTHORING_PATH, REFERRALS_PATH, PROFILE_PATH];
```

- [ ] **Step 2: Add the layout gate (defense-in-depth, mirrors referrals)**

Create `apps/web/src/app/dashboard/profile/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isAdmin } from '@/utils/admin';
import { PROFILE_PATH, loginPathFor } from '@/utils/auth-paths';

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    redirect(loginPathFor(PROFILE_PATH));
  }

  const adminOk = await isAdmin();
  if (!adminOk) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if ((profile as any)?.role !== 'super_user') {
      redirect(loginPathFor(PROFILE_PATH, 'not_authorized'));
    }
  }

  return <>{children}</>;
}
```

Note: `loginPathFor` routes `/dashboard/*` super-user paths to `/super-user/login` automatically once `PROFILE_PATH` is in `SUPER_USER_PATHS` (Step 1).

- [ ] **Step 3: Build the settings page**

Create `apps/web/src/app/dashboard/profile/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { saveProfileSocials } from '@/actions/profile-actions';

const SOCIAL_FIELDS = [
  { name: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/you' },
  { name: 'tiktok_url', label: 'TikTok', placeholder: 'https://tiktok.com/@you' },
  { name: 'website_url', label: 'Website', placeholder: 'https://yoursite.com' },
  { name: 'youtube_url', label: 'YouTube', placeholder: 'https://youtube.com/@you' },
] as const;

const inputCls =
  'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/super-user/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('instagram_url, tiktok_url, website_url, youtube_url')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-background">
      <UserBar />
      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="mb-8">
          <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground">
            ← Dashboard
          </Link>
          <h1 className="text-display-md font-bold text-foreground tracking-tight mt-2">Your socials</h1>
          <p className="text-body-sm text-muted mt-1">
            These links appear on every guide you publish.
          </p>
        </div>

        {sp?.ok ? (
          <div className="rounded-md border border-brand bg-brand-subtle px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-brand-dark">Saved.</p>
          </div>
        ) : null}
        {sp?.error ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Could not save</p>
            <p className="text-body-sm text-error/80 mt-0.5">{sp.error}</p>
          </div>
        ) : null}

        <form action={saveProfileSocials} className="rounded-lg border border-border bg-surface p-6 shadow-sm max-w-xl">
          <div className="flex flex-col gap-4">
            {SOCIAL_FIELDS.map((f) => (
              <div key={f.name}>
                <label htmlFor={f.name} className="text-body-sm font-medium text-foreground block mb-1.5">
                  {f.label}
                </label>
                <input
                  id={f.name}
                  name={f.name}
                  type="url"
                  placeholder={f.placeholder}
                  defaultValue={(profile as any)?.[f.name] ?? ''}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            className="mt-6 inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
          >
            Save socials
          </button>
        </form>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck --workspace web && npm run lint --workspace web`
Expected: clean.

- [ ] **Step 5: Manual verify**

Run the web app (`npm run dev --workspace web`). As a super user, visit `/dashboard/profile`: form loads with any existing values. Save a valid Instagram URL → redirects with "Saved." Enter `javascript:alert(1)` → redirects with an error banner and does NOT persist. As a non-super user (or logged out), `/dashboard/profile` redirects to `/super-user/login`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/profile/ apps/web/src/utils/auth-paths.ts
git commit -m "feat(web): super-user socials settings page at /dashboard/profile"
```

---

### Task 5: Dashboard onboarding banner

**Files:**
- Create: `apps/web/src/app/dashboard/SocialsPromptBanner.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx` (fetch socials state; render banner)

**Interfaces:**
- Consumes: `dismissSocialsPrompt` from `@/actions/profile-actions`.

- [ ] **Step 1: Build the banner component**

Create `apps/web/src/app/dashboard/SocialsPromptBanner.tsx`:

```tsx
import Link from 'next/link';
import { dismissSocialsPrompt } from '@/actions/profile-actions';

export default function SocialsPromptBanner() {
  return (
    <div className="rounded-md border border-brand bg-brand-subtle px-4 py-3 mb-6 flex items-center justify-between gap-4">
      <p className="text-body-sm text-brand-dark">
        Add your socials so they appear on every guide you publish.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/dashboard/profile"
          className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-brand text-white text-caption font-medium hover:bg-brand-dark transition-colors"
        >
          Add socials
        </Link>
        <form action={dismissSocialsPrompt}>
          <button
            type="submit"
            className="inline-flex items-center justify-center h-8 px-3 rounded-md text-caption font-medium text-muted hover:text-foreground border border-border transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire banner into the dashboard page**

In `apps/web/src/app/dashboard/page.tsx`:

Add the import near the top (after existing imports):

```tsx
import SocialsPromptBanner from './SocialsPromptBanner';
```

After the existing `const user = auth.user;` / `if (!user) redirect('/login');` block, add a query for the banner condition:

```tsx
  const { data: socialProfile } = await supabase
    .from('user_profiles')
    .select('role, instagram_url, tiktok_url, website_url, youtube_url, socials_prompt_dismissed_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const p = socialProfile as any;
  const showSocialsPrompt =
    p?.role === 'super_user' &&
    !p?.socials_prompt_dismissed_at &&
    !p?.instagram_url &&
    !p?.tiktok_url &&
    !p?.website_url &&
    !p?.youtube_url;
```

Then render the banner directly after the existing `{/* Error Banner */}` block (before `{/* Create Organization */}`):

```tsx
        {showSocialsPrompt ? <SocialsPromptBanner /> : null}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck --workspace web && npm run lint --workspace web`
Expected: clean.

- [ ] **Step 4: Manual verify**

As a super user with all four social fields empty and no dismissal: `/dashboard` shows the banner. Click Dismiss → banner disappears and stays gone on reload. Clear `socials_prompt_dismissed_at` via SQL and add one social link → banner does not reappear (because a link now exists). As a non-super user: never shown.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/SocialsPromptBanner.tsx apps/web/src/app/dashboard/page.tsx
git commit -m "feat(web): dashboard onboarding banner for super-user socials"
```

---

### Task 6: Author byline on the public guide page

**Files:**
- Create: `apps/directory/src/components/AuthorByline.tsx`
- Modify: `apps/directory/src/app/guides/[slug]/page.tsx`

**Interfaces:**
- Consumes: `public_guide_authors` view via the anon `supabase` client (`@/lib/supabase`).
- Produces: `<AuthorByline author={...} />` rendering only when ≥1 social link is present.

- [ ] **Step 1: Build the byline component**

Create `apps/directory/src/components/AuthorByline.tsx`:

```tsx
import Image from "next/image";

type Author = {
  display_name: string | null;
  avatar_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  youtube_url: string | null;
};

const LINKS = [
  { key: "instagram_url", label: "Instagram", color: "#E1306C" },
  { key: "tiktok_url", label: "TikTok", color: "#111827" },
  { key: "youtube_url", label: "YouTube", color: "#FF0000" },
  { key: "website_url", label: "Website", color: "#0F766E" },
] as const;

export default function AuthorByline({ author }: { author: Author }) {
  const socials = LINKS.map((l) => ({ ...l, href: author[l.key] })).filter((l) => !!l.href);
  if (socials.length === 0) return null;

  return (
    <div className="flex items-center gap-4 border-t border-border pt-6 mb-8">
      {author.avatar_url ? (
        <Image
          src={author.avatar_url}
          alt={author.display_name ?? "Author"}
          width={44}
          height={44}
          className="rounded-full w-11 h-11 object-cover bg-cream"
        />
      ) : null}
      <div>
        {author.display_name ? (
          <p className="text-sm font-semibold text-foreground">{author.display_name}</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {socials.map((l) => (
            <a
              key={l.key}
              href={l.href as string}
              target="_blank"
              rel="nofollow ugc noopener noreferrer"
              className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors hover:text-white"
              style={{ borderColor: l.color, color: l.color }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fetch author_id in getGuide + add author query**

In `apps/directory/src/app/guides/[slug]/page.tsx`:

Add `author_id` to the `getGuide` select (line ~17):

```ts
    .select("id, title, subtitle, body_md, city, tags, cover_image_url, published_at, updated_at, author_id")
```

Add a helper below `getGuide`:

```ts
async function getAuthor(authorId: string | null) {
  if (!authorId) return null;
  const { data } = await supabase
    .from("public_guide_authors")
    .select("display_name, avatar_url, instagram_url, tiktok_url, website_url, youtube_url")
    .eq("author_id", authorId)
    .maybeSingle();
  return data ?? null;
}
```

- [ ] **Step 3: Render the byline**

In the `GuidePage` component, after `const guide = await getGuide(slug);` / `if (!guide) notFound();`, fetch the author:

```tsx
  const author = await getAuthor(guide.author_id);
```

Add the import at the top:

```tsx
import AuthorByline from "@/components/AuthorByline";
```

Render it immediately after the closing `</header>` (line ~154), before `{/* Body */}`:

```tsx
        {author ? <AuthorByline author={author} /> : null}
```

(The component itself returns `null` when the author has zero social links, so no byline shows for socials-less authors.)

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck --workspace directory && npm run lint --workspace directory`
Expected: clean. (The directory `supabase` client is untyped, so the view query type-checks as-is.)

- [ ] **Step 5: Manual verify**

Run the directory app. Open a published guide whose author has ≥1 social saved: byline renders with avatar + name + pill links; each link opens in a new tab and its HTML has `rel="nofollow ugc noopener noreferrer"`. Open a guide whose author has NO socials: no byline appears, page otherwise unchanged. Confirm retroactivity: an already-published guide shows the byline once its author saves a social.

- [ ] **Step 6: Commit**

```bash
git add apps/directory/src/components/AuthorByline.tsx "apps/directory/src/app/guides/[slug]/page.tsx"
git commit -m "feat(directory): author socials byline on published guides"
```

---

### Task 7: Full verification + PR

- [ ] **Step 1: Repo-wide gates**

Run: `npm run typecheck && npm run lint`
Expected: clean across workspaces.

- [ ] **Step 2: Run the unit test**

Run: `node --test apps/web/src/lib/socialUrl.test.mjs`
Expected: PASS.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/super-user-author-socials
gh pr create --fill
```

- [ ] **Step 4: Confirm CI green on Node 20**

Wait for GitHub CI. A change is not done until CI is green (CI is Node 20; local pass ≠ CI pass).

---

## Notes on decisions carried from the spec

- **Live join, retroactive:** the byline reads `public_guide_authors` at render time, so saving/editing socials propagates to all of an author's published guides instantly. No per-guide snapshot.
- **Byline only with ≥1 link:** enforced in `AuthorByline` (returns `null`) AND the banner condition, so socials-less authors see no byline and existing guides stay unchanged until socials exist.
- **View predicate = published guides, not `is_public`:** a private-profile super user still gets a byline.
- **https-only validation:** closes the gap the venue `*_url` fields left open; applied in the Server Action via `normalizeSocialUrl`.
```
