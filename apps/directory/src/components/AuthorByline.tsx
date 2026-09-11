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
