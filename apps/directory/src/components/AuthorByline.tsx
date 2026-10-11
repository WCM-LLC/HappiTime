import Link from "next/link";

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

/** `href` is the author's page; the name links there so every guide credits a real person. */
export default function AuthorByline({ author, href }: { author: Author; href?: string }) {
  const socials = LINKS.map((l) => ({ ...l, href: author[l.key] })).filter((l) => !!l.href);
  if (socials.length === 0 && !author.display_name) return null;

  return (
    <div className="flex items-center gap-4 border-t border-border pt-6 mb-8">
      {author.avatar_url ? (
        // Plain <img> (not next/image): avatars are raw Supabase Storage URLs and
        // the directory app configures no images.remotePatterns — next/image would
        // 400 the optimizer at runtime. Guide covers avoid this via a same-origin
        // proxy; a 44px byline avatar doesn't warrant that indirection.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.avatar_url}
          alt={author.display_name ?? "Author"}
          width={44}
          height={44}
          loading="lazy"
          className="rounded-full w-11 h-11 object-cover bg-cream"
        />
      ) : null}
      <div>
        {author.display_name ? (
          <p className="text-sm font-semibold text-foreground">
            {href ? (
              <Link href={href} rel="author" className="hover:text-brand">
                {author.display_name}
              </Link>
            ) : (
              author.display_name
            )}
          </p>
        ) : null}
        {socials.length > 0 ? (
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
        ) : null}
      </div>
    </div>
  );
}
