import Link from "next/link";
import type { VenueAvatar } from "@/lib/siteStats";

/**
 * The count, with faces on it: a row of real listed venues' photos next to the
 * one sitewide venue number (lib/siteStats). Pure markup — safe to render from
 * server or client components.
 */
export function VenueProofStrip({
  venueCount,
  avatars,
  tone = "light",
  className = "",
}: {
  venueCount: number;
  avatars: VenueAvatar[];
  tone?: "light" | "dark";
  className?: string;
}) {
  const ring = tone === "dark" ? "border-dark" : "border-background";
  const strong = tone === "dark" ? "text-cream" : "text-foreground";
  const soft = tone === "dark" ? "text-dark-muted" : "text-muted";

  return (
    <div className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 ${className}`}>
      {avatars.length > 0 && (
        <ul className="flex list-none items-center pl-2" aria-label="Some of the spots listed on HappiTime">
          {avatars.map((a) => (
            <li key={a.slug} className="-ml-2">
              <a href={`/v/${a.slug}/`} title={a.name} className="block">
                {/* Plain <img>: a 36px Cloudinary thumbnail already sized by its
                    own transform; next/image would add nothing here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.src}
                  alt={a.name}
                  width={36}
                  height={36}
                  loading="eager"
                  decoding="async"
                  className={`size-9 rounded-full border-2 ${ring} bg-cream object-cover`}
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className={`m-0 text-sm leading-snug ${soft}`}>
        <Link href="/kc/" className={`font-bold ${strong} hover:underline`}>
          {venueCount} Kansas City spots listed
        </Link>{" "}
        <span aria-hidden="true">·</span> every one checked by hand, and paying venues update
        their own
      </p>
    </div>
  );
}
