import { supabase } from "@/lib/supabase";
import { authorSlug, resolveAuthorSlug } from "@/lib/authorSlug";

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

export async function getGuideAuthors(): Promise<{ author: GuideAuthor; slug: string }[]> {
  const { data } = await supabase.from("public_guide_authors").select(AUTHOR_FIELDS);
  return ((data ?? []) as GuideAuthor[]).map((author) => ({ author, slug: authorSlug(author) }));
}

/**
 * The author a requested /author/<slug>/ points at, with the canonical slug.
 * The page 301s when they differ (a renamed author, or an old name-only URL).
 */
export async function resolveGuideAuthor(requested: string) {
  const { data } = await supabase.from("public_guide_authors").select(AUTHOR_FIELDS);
  return resolveAuthorSlug(requested, (data ?? []) as GuideAuthor[]);
}

export async function getGuideAuthorById(authorId: string | null) {
  if (!authorId) return null;
  return (await getGuideAuthors()).find((a) => a.author.author_id === authorId) ?? null;
}

export function authorPath(slug: string): string {
  return `/author/${slug}/`;
}
