import { supabase } from "@/lib/supabase";

export type GuideAuthor = {
  author_id: string;
  display_name: string | null;
  avatar_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  youtube_url: string | null;
};

const AUTHOR_FIELDS = "author_id, display_name, avatar_url, instagram_url, tiktok_url, website_url, youtube_url";

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * URL slug for an author page: the display name, plus the first 8 characters
 * of the author id when two published authors share a name. The view only
 * exposes authors with a published guide, so the set is small enough to
 * resolve in full; no handle column is needed.
 */
function authorSlugs(authors: GuideAuthor[]): Map<string, string> {
  const base = new Map(authors.map((a) => [a.author_id, slugify(a.display_name ?? "") || "author"]));
  const seen = new Map<string, number>();
  for (const s of base.values()) seen.set(s, (seen.get(s) ?? 0) + 1);
  return new Map(
    [...base].map(([id, s]) => [id, seen.get(s)! > 1 || s === "author" ? `${s}-${id.slice(0, 8)}` : s]),
  );
}

export async function getGuideAuthors(): Promise<{ author: GuideAuthor; slug: string }[]> {
  const { data } = await supabase.from("public_guide_authors").select(AUTHOR_FIELDS);
  const authors = (data ?? []) as GuideAuthor[];
  const slugs = authorSlugs(authors);
  return authors.map((author) => ({ author, slug: slugs.get(author.author_id)! }));
}

export async function getGuideAuthorBySlug(slug: string) {
  return (await getGuideAuthors()).find((a) => a.slug === slug) ?? null;
}

export async function getGuideAuthorById(authorId: string | null) {
  if (!authorId) return null;
  return (await getGuideAuthors()).find((a) => a.author.author_id === authorId) ?? null;
}

export function authorPath(slug: string): string {
  return `/author/${slug}/`;
}
