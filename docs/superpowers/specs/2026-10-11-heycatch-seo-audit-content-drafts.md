# HeyCatch SEO Audit — Content Drafts and Open Decisions

**Status:** Drafts — nothing here is applied. Each item needs the guide author's or the owner's OK.
**Date:** 2026-10-11
**Audit:** heycatch.ai SEO audit `66f75001-3f9e-43d4-a012-8543893ccd1e` (74/100)
**Code fixes:** branch `seo/heycatch-audit-fixes`

The code-side findings are fixed on the branch. The findings below depend on text stored in the
`guides` table (written by Super Users), or on a decision that isn't a code change. Editing a
published guide's `body_md` is a production data write to someone else's writing, so it is drafted
here, not done.

## 1. Daycap guide — worth 10 of the 26 open points

`/guides/daycap-women-kansas-city/` is the only page failing three findings at once:
`g_answer_first` (0/4), `a_external_sources` (0/4) and `a_author_page` (0/2, fixed in code).

### g_answer_first — open with the answer (40–60 words)

The guide spends two paragraphs on context before it says where to go. Proposed opening paragraph,
built only from claims the guide already makes (60 words, longest sentence 18):

> A daycap is a drink or a mocktail in the late afternoon, wrapped up before 9 PM. In Kansas City,
> arrive around 4:30 to 5 PM to catch happy hour pricing and a patio seat. Cafe Corazon and Gram &
> Dun have the most photogenic patios. Tannin and Extra Virgin make zero-proof drinks to order.
> Kona Grill takes big groups.

The current first paragraph then follows as context.

### a_external_sources — at least two independent primary sources

The guide's framing (a younger generation drinking less, the sober-curious movement) is checkable.
Two independent publishers; every link checked and resolving on 2026-10-11:

| Source | What it supports | Where it fits |
|---|---|---|
| Gallup, [Young Adults in U.S. Drinking Less Than in Prior Decades](https://news.gallup.com/poll/509690/young-adults-drinking-less-prior-decades.aspx) (2023) | The drinking rate among younger adults fell 10 points over two decades | "Why the Daycap Works" |
| Gallup, [U.S. Drinking Rate at New Low as Alcohol Concerns Surge](https://news.gallup.com/poll/693362/drinking-rate-new-low-alcohol-concerns-surge.aspx) (2025) | Young adults are the most likely to say drinking is bad for health | "Mocktail-Friendly Happy Hours" |
| NIAAA, [Understanding Alcohol Drinking Patterns](https://www.niaaa.nih.gov/alcohols-effects-health/alcohol-drinking-patterns) | Federal definitions of moderate drinking | Optional, "How to Plan the Perfect Daycap" |

Suggested sentence for "Why the Daycap Works": *Younger adults are drinking less than they did 20
years ago, [Gallup found in 2023](…509690…), and by 2025 they were the group most likely to call
drinking bad for their health ([Gallup](…693362…)).*

### c_question_headings — H2s as the reader's questions

| Now | Proposed |
|---|---|
| Why the Daycap Works | Why go out for a daycap instead of a late night? |
| Aesthetic Patios | Which Kansas City patios are best for a daycap? |
| Mocktail-Friendly Happy Hours | Where can you get a good mocktail at happy hour in KC? |
| Big-Group Friendly | Where can a big group go for happy hour? |
| Solo & Date-Safe | Where can you go solo or on a first date? |
| How to Plan the Perfect Daycap | What time should a daycap start? |

Each answer should then open with its direct answer. Most sections already do.

## 2. Other community guides

These guides fail `c_question_headings` (0.8/2) and, apart from the streetcar crawl, `c_thin`
(0.2/2, under 800 words). They are first-person pieces. The author should decide whether to extend,
merge or leave each one. Word counts are of `body_md`.

| Guide | Words | Heading suggestion | Other |
|---|---|---|---|
| vine-st-brewing-co-company | 511 | "The Vibe" → "What is Vine St. Brewing like to work from?" | Body opens with a second `# H1`; make it `##` |
| a-realtors-favorite-way-to-start-a-saturday | 480 | Add one, e.g. "What should you order at First Watch?" | Body opens with an H2 that repeats the title; drop it |
| add-this-restaurant-to-your-list | 322 | Add one question H2 | No subtitle |
| el-sazon-mexican-grill-a-local-favorite-in-lees-summit-2 | 334 | Add one, e.g. "Why is El Sazon a Lee's Summit favorite?" | Title is 56 chars (limit 48 before " \| HappiTime"). Suggest "El Sazon Mexican Grill in Lee's Summit" (38) |
| kc-streetcar-happy-hour-crawl | 334 | "North to south, stop by stop" → "Which happy hours are on the streetcar line?" | Passes `c_thin` |
| kc-weekend-playlist-saturday | 423 | "The run, hour by hour" → "What's the best order for a Saturday night of live music?" | Subtitle is one 27-word sentence; split it |

The template now tops up short descriptions with the author and update month, so these guides no
longer need a subtitle to pass `c_meta_description`.

## 3. Decisions for the owner

- **Author bios (`a_author_page`).** `/author/<name>/` pages now exist with name, photo, socials and
  every published guide. `user_profiles.bio` exists, but `public_guide_authors` does not expose it.
  Showing a bio publicly needs a migration that adds `bio` to that view. That is a call about what
  a profile shows on the open web, so it isn't made here. The page has a stub comment where the bio
  goes.
- **Supabase-hosted photos (`c_image_format`).** Cloudinary images now always serve WebP. Venue
  photos in Supabase Storage (`venue-media/places/…`) are still raw JPEG. Supabase's
  `/render/image/` endpoint returns WebP (tested), but image transformations are billed per source
  image, and there are about six photos per venue. Cloudinary `fetch` is disabled on the account
  (401). Options: enable transformations, enable Cloudinary fetch, or migrate those photos to
  Cloudinary.
- **Content-Security-Policy (`t_security_headers`).** It ships as `Content-Security-Policy-Report-Only`,
  as the audit advises. There is no `report-uri` yet, so violations show only in the browser
  console. Watch the console on the main pages, or add a reporting endpoint, then rename the
  header to enforce it. The audit re-run may still count CSP as missing until then.
- **Daycap guide author.** `guides.author_id` is null, so the page credits "the HappiTime editors"
  and links to `/about/`, which now lists the editorial guides. If one person wrote it, setting
  `author_id` gives it a personal byline and `/author/` page. That is a data write, so it's your call.
- **Two founder author identities.** `public_guide_authors` has both "Juan Williams" and
  "juanderful1". The second one's `/author/juanderful1/` page reads as a handle, not a person.
  Either set that profile's display name or move its guides to the main profile.
