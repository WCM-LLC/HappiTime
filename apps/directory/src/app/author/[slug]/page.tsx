import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authorPath, resolveGuideAuthor } from "@/lib/authors";
import { breadcrumbJsonLd, jsonLdHtml } from "@/lib/structuredData";
import { DEFAULT_OG_IMAGE, fitDescription, fitTitle } from "@/lib/seoText";

const BASE = "https://happitime.biz";

export const revalidate = 900;

type Props = { params: Promise<{ slug: string }> };

const LINKS = [
  { key: "instagram_url", label: "Instagram" },
  { key: "tiktok_url", label: "TikTok" },
  { key: "youtube_url", label: "YouTube" },
  { key: "website_url", label: "Website" },
] as const;

async function getAuthorGuides(authorId: string) {
  const { data } = await supabase
    .from("guides")
    .select("slug, title, subtitle, published_at, updated_at")
    .eq("author_id", authorId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return data ?? [];
}

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await resolveGuideAuthor(slug);
  if (!found) return {};
  const name = found.author.display_name ?? "HappiTime author";
  const guides = await getAuthorGuides(found.author.author_id);
  const title = fitTitle([`${name}, Kansas City Guide Writer`, `${name} on HappiTime`, name]);
  const description = fitDescription([
    `${name} writes Kansas City happy hour guides for HappiTime.`,
    `${guides.length} published ${guides.length === 1 ? "guide" : "guides"}${guides[0] ? `, including "${guides[0].title}"` : ""}.`,
    `${guides.length} published ${guides.length === 1 ? "guide" : "guides"}.`,
    "Read them free on HappiTime.",
  ]);
  const canonical = `${BASE}${authorPath(found.slug)}`;
  const image = found.author.avatar_url ? { url: found.author.avatar_url } : DEFAULT_OG_IMAGE;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "profile", siteName: "HappiTime", images: [image] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const found = await resolveGuideAuthor(slug);
  if (!found) notFound();
  // A stale name part or an old name-only URL: send it to the current one.
  if (found.slug !== slug) permanentRedirect(authorPath(found.slug));
  const { author } = found;
  const name = author.display_name ?? "HappiTime author";
  const guides = await getAuthorGuides(author.author_id);
  const socials = LINKS.map((l) => ({ ...l, href: author[l.key] })).filter(
    (l): l is (typeof l) & { href: string } => !!l.href,
  );
  const canonical = `${BASE}${authorPath(found.slug)}`;
  const firstPublished = guides.map((g) => g.published_at).filter(Boolean).sort()[0] as string | undefined;

  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: canonical,
    mainEntity: {
      "@type": "Person",
      name,
      url: canonical,
      ...(author.avatar_url ? { image: author.avatar_url } : {}),
      ...(socials.length ? { sameAs: socials.map((s) => s.href) } : {}),
    },
    hasPart: guides.map((g) => ({
      "@type": "Article",
      headline: g.title,
      url: `${BASE}/guides/${g.slug}/`,
      ...(g.published_at ? { datePublished: g.published_at } : {}),
    })),
  };
  const breadcrumbs = breadcrumbJsonLd([
    { name: "HappiTime", url: `${BASE}/` },
    { name: "Guides", url: `${BASE}/guides/` },
    { name, url: canonical },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(profileJsonLd)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(breadcrumbs)} />

      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-foreground transition-colors">HappiTime</Link>
        <span className="text-muted-light">/</span>
        <Link href="/guides/" className="hover:text-foreground transition-colors">Guides</Link>
        <span className="text-muted-light">/</span>
        <span className="text-foreground font-medium">{name}</span>
      </nav>

      <header className="flex flex-col sm:flex-row sm:items-center gap-5 mb-10">
        {author.avatar_url ? (
          // Plain <img>: a raw Supabase Storage avatar, same as the guide bylines.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatar_url}
            alt={name}
            width={96}
            height={96}
            className="size-24 shrink-0 rounded-full bg-cream object-cover"
          />
        ) : null}
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-2">{name}</h1>
          <p className="text-muted">
            Writes Kansas City happy hour guides for HappiTime.
            {firstPublished ? ` First guide published ${formatMonth(firstPublished)}.` : ""}
          </p>
          {socials.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {socials.map((s) => (
                <a
                  key={s.key}
                  href={s.href}
                  target="_blank"
                  rel="me nofollow ugc noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted hover:text-foreground"
                >
                  {s.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {/* Bio and experience: user_profiles.bio exists but public_guide_authors does
          not expose it. Rendering it here needs a migration adding bio to that
          view — a decision about what a profile shows publicly, not made here. */}

      <section>
        <h2 className="text-xl font-bold text-foreground mb-4">
          {guides.length === 1 ? "Guide" : `Guides (${guides.length})`} by {name}
        </h2>
        <ul className="space-y-4">
          {guides.map((g) => (
            <li key={g.slug} className="rounded-xl border border-border bg-surface p-5">
              <Link href={`/guides/${g.slug}/`} className="font-semibold text-foreground hover:text-brand">
                {g.title}
              </Link>
              {g.subtitle ? <p className="text-sm text-muted mt-1">{g.subtitle}</p> : null}
              {g.published_at ? (
                <p className="text-xs text-muted-light mt-2">Published {formatMonth(g.published_at)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
