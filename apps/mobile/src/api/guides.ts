// src/api/guides.ts
//
// Published Tastemaker guides in the app, on the same attribution rail the web
// uses: a guide's companion itinerary (user_lists.source_guide_id) is what earns
// the author credit. Opening a guide here logs an itinerary_view touch on that
// list; tapping a venue in it logs an itinerary_venue_tap; a check-in within the
// window is then credited by the existing trigger. Alongside, guide_view /
// guide_venue_click rows in user_events feed the author's view and click
// counts (super_user_metrics()). Guests get the content; only signed-in users
// write anything (user_events RLS requires user_id = auth.uid()).

import { supabase } from "./supabaseClient";

export type GuideSummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  city: string | null;
  neighborhood: string | null;
  tags: string[] | null;
  published_at: string | null;
  author_id: string | null;
  author?: GuideAuthor | null;
};

export type GuideAuthor = {
  author_id: string;
  display_name: string | null;
  avatar_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  youtube_url: string | null;
  handle?: string | null;
};

export type Guide = GuideSummary & { body_md: string | null; updated_at: string | null };

export type GuideItinerary = { token: string; spots: number; author_handle: string | null; list_id?: string | null };

function httpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : null;
}

export async function fetchPublishedGuides(): Promise<GuideSummary[]> {
  const { data, error } = await supabase
    .from("guides")
    .select("id, slug, title, subtitle, cover_image_url, city, neighborhood, tags, published_at, author_id")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = ((data ?? []) as GuideSummary[]).map((g) => ({ ...g, cover_image_url: httpUrl(g.cover_image_url) }));
  const authorIds = Array.from(new Set(rows.map((g) => g.author_id).filter((x): x is string => !!x)));
  const authors = authorIds.length ? await fetchAuthors(authorIds) : {};
  return rows.map((g) => ({ ...g, author: g.author_id ? authors[g.author_id] ?? null : null }));
}

async function fetchAuthors(ids: string[]): Promise<Record<string, GuideAuthor>> {
  const { data } = await supabase
    .from("public_guide_authors")
    .select("author_id, display_name, avatar_url, instagram_url, tiktok_url, website_url, youtube_url")
    .in("author_id", ids);
  const out: Record<string, GuideAuthor> = {};
  for (const a of (data ?? []) as GuideAuthor[]) out[a.author_id] = { ...a, avatar_url: httpUrl(a.avatar_url) };
  return out;
}

export async function fetchGuideBySlug(slug: string): Promise<Guide | null> {
  const { data, error } = await supabase
    .from("guides")
    .select("id, slug, title, subtitle, body_md, cover_image_url, city, neighborhood, tags, published_at, updated_at, author_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const g = data as Guide;
  const authors = g.author_id ? await fetchAuthors([g.author_id]) : {};
  return { ...g, cover_image_url: httpUrl(g.cover_image_url), author: g.author_id ? authors[g.author_id] ?? null : null };
}

/** The guide's companion itinerary (share token + list id), or null when it has none. */
export async function fetchGuideItinerary(guideId: string): Promise<GuideItinerary | null> {
  const { data, error } = await (supabase as any).rpc("get_guide_itinerary", { p_guide_id: guideId });
  if (error || !data) return null;
  const row = data as Partial<GuideItinerary>;
  if (!row.token || !row.spots) return null;
  // The RPC returns the share token; resolve the list id (needed for touches)
  // through the list itself, which RLS lets us read by token only via the
  // shared-itinerary RPC — so fall back to get_shared_itinerary for the id.
  let listId: string | null = (row as any).list_id ?? null;
  if (!listId) {
    const { data: shared } = await (supabase as any).rpc("get_shared_itinerary", { p_token: row.token });
    listId = (shared as any)?.id ?? (shared as any)?.list_id ?? (Array.isArray(shared) ? shared[0]?.id ?? shared[0]?.list_id : null) ?? null;
  }
  return { token: row.token, spots: row.spots, author_handle: row.author_handle ?? null, list_id: listId };
}

// Matches the venue-page URL shapes guide_venue_slugs() recognises in SQL.
const VENUE_HREF_RE =
  /^(?:https?:\/\/(?:www\.)?happitime\.biz)?\/(?:kc\/[a-z0-9-]+|v)\/([a-z0-9][a-z0-9-]*)\/?(?:[?#].*)?$/i;

export function venueSlugFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const m = VENUE_HREF_RE.exec(href.trim());
  return m ? m[1].toLowerCase() : null;
}

/** venue slug → { id, name } for the venue pages a guide body links to. */
export async function resolveLinkedVenues(bodyMd: string | null): Promise<Record<string, { id: string; name: string }>> {
  const slugs = new Set<string>();
  for (const m of (bodyMd ?? "").matchAll(/\]\(\s*([^)\s]+)|https?:\/\/(?:www\.)?happitime\.biz\/[^\s)]+/gi)) {
    const slug = venueSlugFromHref(m[1] ?? m[0]);
    if (slug) slugs.add(slug);
  }
  if (slugs.size === 0) return {};
  const { data } = await supabase.from("venues").select("id, slug, name").in("slug", Array.from(slugs)).eq("status", "published");
  const out: Record<string, { id: string; name: string }> = {};
  for (const v of (data ?? []) as { id: string; slug: string | null; name: string }[]) {
    if (v.slug) out[v.slug.toLowerCase()] = { id: v.id, name: v.name };
  }
  return out;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Signed-in open of a guide: view count + itinerary_view touch on the companion list. */
export async function trackGuideView(guide: Pick<Guide, "id" | "author_id">, itinerary: GuideItinerary | null): Promise<void> {
  try {
    const uid = await currentUserId();
    if (!uid) return;
    await supabase.from("user_events").insert({
      user_id: uid,
      event_type: "guide_view",
      venue_id: null,
      meta: { guide_id: guide.id, author_id: guide.author_id, source: "app" },
    });
    if (itinerary?.list_id && guide.author_id && guide.author_id !== uid) {
      await (supabase as any).rpc("record_itinerary_touch", { p_list_id: itinerary.list_id, p_venue_id: null });
    }
  } catch {
    // Tracking never blocks reading.
  }
}

/** Signed-in tap on a venue inside a guide: click count + itinerary_venue_tap touch. */
export async function trackGuideVenueTap(
  guide: Pick<Guide, "id" | "author_id">,
  venueId: string,
  itinerary: GuideItinerary | null,
): Promise<void> {
  try {
    const uid = await currentUserId();
    if (!uid) return;
    await supabase.from("user_events").insert({
      user_id: uid,
      event_type: "guide_venue_click",
      venue_id: venueId,
      meta: { guide_id: guide.id, author_id: guide.author_id, source: "app" },
    });
    if (itinerary?.list_id && guide.author_id && guide.author_id !== uid) {
      await (supabase as any).rpc("record_itinerary_touch", { p_list_id: itinerary.list_id, p_venue_id: venueId });
    }
  } catch {
    // Tracking never blocks navigation.
  }
}
