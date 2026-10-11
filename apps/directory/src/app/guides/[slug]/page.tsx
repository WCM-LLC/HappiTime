import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/structuredData";
import { supabase } from "@/lib/supabase";
import { guideCoverImageSrc, normalizeGuideCoverImageUrl } from "@/lib/guideCoverUrl";
import ImageLightbox from "@/components/ImageLightbox";
import AuthorByline from "@/components/AuthorByline";

const BASE = "https://happitime.biz";

export const dynamic = "force-dynamic";

async function getGuide(slug: string) {
  const { data } = await supabase
    .from("guides")
    .select("id, title, subtitle, body_md, city, tags, cover_image_url, published_at, updated_at, author_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data ?? null;
}

type GuideItinerary = { token: string; spots: number; author_handle: string | null };

// The guide's companion itinerary: every venue the guide links to, owned by the
// author (see 20261011041500_guide_itineraries.sql). Opening it in the app is what
// lets a later check-in be credited to the author. Null for guides with no linked
// venues or a non-Insider author — the page then simply shows no "open in app" card.
async function getGuideItinerary(guideId: string): Promise<GuideItinerary | null> {
  const { data, error } = await supabase.rpc("get_guide_itinerary", { p_guide_id: guideId });
  if (error || !data) return null;
  const row = data as Partial<GuideItinerary>;
  if (!row.token || !row.spots) return null;
  return { token: row.token, spots: row.spots, author_handle: row.author_handle ?? null };
}

async function getAuthor(authorId: string | null) {
  if (!authorId) return null;
  const { data } = await supabase
    .from("public_guide_authors")
    .select("display_name, avatar_url, instagram_url, tiktok_url, website_url, youtube_url")
    .eq("author_id", authorId)
    .maybeSingle();
  return data ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) return {};

  const canonical = `${BASE}/guides/${slug}/`;
  const description = guide.subtitle ?? `A Super User guide from HappiTime — ${guide.title}`;
  const coverImageUrl = normalizeGuideCoverImageUrl(guide.cover_image_url);

  return {
    title: `${guide.title} | HappiTime`,
    description,
    keywords: guide.tags ?? [],
    alternates: { canonical },
    openGraph: {
      title: guide.title,
      description,
      url: canonical,
      type: "article",
      siteName: "HappiTime",
      ...(coverImageUrl ? { images: [{ url: coverImageUrl }] } : {}),
      ...(guide.published_at ? { publishedTime: guide.published_at } : {}),
      ...(guide.updated_at ? { modifiedTime: guide.updated_at } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description,
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) notFound();

  const [author, itinerary] = await Promise.all([
    getAuthor(guide.author_id),
    getGuideItinerary(guide.id),
  ]);
  // Same shape the app's own share sheet produces: /i/{token}?ref={handle}.
  const itineraryHref = itinerary
    ? `/i/${itinerary.token}${itinerary.author_handle ? `?ref=${encodeURIComponent(itinerary.author_handle)}` : ""}`
    : null;

  const canonical = `${BASE}/guides/${slug}/`;
  const coverImageUrl = normalizeGuideCoverImageUrl(guide.cover_image_url);
  const coverImageSrc = guideCoverImageSrc(coverImageUrl);

  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
    { name: guide.title, url: canonical },
  ]);

  const article = articleJsonLd({
    title: guide.title,
    description: guide.subtitle ?? guide.title,
    url: canonical,
    imageUrl: coverImageUrl ?? undefined,
    publishedTime: guide.published_at ?? undefined,
    modifiedTime: guide.updated_at ?? undefined,
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
      />

      {/* Breadcrumb nav */}
      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </Link>
        <span className="text-muted-light">/</span>
        <Link href="/guides/" className="hover:text-foreground transition-colors">
          Guides
        </Link>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium truncate max-w-[18rem]">
          {guide.title}
        </span>
      </nav>

      <ImageLightbox>
        {/* Cover image */}
        {coverImageSrc ? (
          <div className="rounded-2xl overflow-hidden mb-8 aspect-[2/1] bg-cream">
            <Image
              src={coverImageSrc}
              alt={guide.title}
              width={1200}
              height={600}
              sizes="(max-width: 768px) 100vw, 768px"
              className="w-full h-full object-cover"
            />
          </div>
        ) : null}

        {/* Header */}
        <header className="mb-8">
          {guide.city ? (
            <p className="text-sm font-semibold text-brand uppercase tracking-wider mb-2">
              {guide.city}
            </p>
          ) : null}
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
            {guide.title}
          </h1>
          {guide.subtitle ? (
            <p className="text-lg text-muted leading-relaxed">{guide.subtitle}</p>
          ) : null}
          {guide.tags && guide.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {Array.from(new Set(guide.tags as string[])).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border px-3 py-0.5 text-xs font-medium text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        {author ? <AuthorByline author={author} /> : null}

        {/* Body */}
        <article className="prose prose-gray max-w-none">
          <ReactMarkdown>{guide.body_md ?? ""}</ReactMarkdown>
        </article>
      </ImageLightbox>

      {/* Take the guide with you — the guide's linked venues as an in-app itinerary */}
      {itinerary && itineraryHref ? (
        <section className="mt-12 rounded-2xl border border-border bg-surface p-8 text-center">
          <h2 className="text-xl font-bold text-foreground mb-2">
            Take {itinerary.spots === 1 ? "this spot" : `these ${itinerary.spots} spots`} with you
          </h2>
          <p className="text-sm text-muted mb-5 max-w-md mx-auto">
            Open this guide as an itinerary in the HappiTime app to save it, see it on the map and check in when you get there.
          </p>
          <a
            href={itineraryHref}
            className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            Open the itinerary
          </a>
        </section>
      ) : null}

      {/* CTA */}
      <section className={`${itineraryHref ? "mt-6" : "mt-12"} rounded-2xl bg-brand-subtle p-8 text-center`}>
        <h2 className="text-xl font-bold text-foreground mb-2">
          Find happy hours happening right now
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          Browse live deals across every KC neighborhood or download the app
          for reminders.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/kc/"
            className="inline-block rounded-full border border-brand px-6 py-2.5 text-brand font-semibold text-sm hover:bg-brand hover:text-white transition-colors"
          >
            Browse KC Happy Hours
          </Link>
          <a
            href="/app/"
            className="inline-block rounded-full bg-brand px-6 py-2.5 text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            Get the App
          </a>
        </div>
      </section>
    </div>
  );
}
