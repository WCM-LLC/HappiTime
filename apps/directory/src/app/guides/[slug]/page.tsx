import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { breadcrumbJsonLd } from "@/lib/structuredData";
import { supabase } from "@/lib/supabase";
import { guideCoverImageSrc, normalizeGuideCoverImageUrl } from "@/lib/guideCoverUrl";
import ImageLightbox from "@/components/ImageLightbox";

const BASE = "https://happitime.biz";

export const dynamic = "force-dynamic";

async function getGuide(slug: string) {
  const { data } = await supabase
    .from("guides")
    .select("id, title, subtitle, body_md, city, tags, cover_image_url, published_at, updated_at")
    .eq("slug", slug)
    .eq("status", "published")
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

  const canonical = `${BASE}/guides/${slug}/`;
  const coverImageUrl = normalizeGuideCoverImageUrl(guide.cover_image_url);
  const coverImageSrc = guideCoverImageSrc(coverImageUrl);

  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
    { name: guide.title, url: canonical },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      {/* Breadcrumb nav */}
      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <a href="/" className="hover:text-foreground transition-colors">
          HappiTime
        </a>
        <span className="text-muted-light">/</span>
        <a href="/guides/" className="hover:text-foreground transition-colors">
          Guides
        </a>
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
              {guide.tags.map((tag: string) => (
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

        {/* Body */}
        <article className="prose prose-gray max-w-none">
          <ReactMarkdown>{guide.body_md ?? ""}</ReactMarkdown>
        </article>
      </ImageLightbox>

      {/* CTA */}
      <section className="mt-12 rounded-2xl bg-brand-subtle p-8 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Find happy hours happening right now
        </h2>
        <p className="text-sm text-muted mb-5 max-w-md mx-auto">
          Browse live deals across every KC neighborhood or download the app
          for reminders.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="/kc/"
            className="inline-block rounded-full border border-brand px-6 py-2.5 text-brand font-semibold text-sm hover:bg-brand hover:text-white transition-colors"
          >
            Browse KC Happy Hours
          </a>
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
