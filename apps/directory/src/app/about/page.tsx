import type { Metadata } from "next";
import { PageTracker } from "@/components/PageTracker";
import { supabase } from "@/lib/supabase";

/**
 * ABOUT — who runs HappiTime.
 *
 * /about/ used to 404 and the only identity on the site was an LLC name in the
 * legal pages. At this stage the founder is the brand, so this page puts a
 * name (and, once added, a face) on it.
 *
 * ── Photo and links come from Juan's own HappiTime profile (@jwill86) ───────
 * The page reads the profile picture and any social links (Instagram, TikTok,
 * YouTube, website) live from that account, so changing them in the app
 * changes them here within the hour. public/about/juan-williams.jpg is a copy
 * of the same picture, used only if the profile cannot be read.
 *   linkedin / x   Not fields on a HappiTime profile. Set the full URL below
 *                  to show them; left null, the link is simply not rendered.
 * The "why I built this" copy speaks in the first person. Read it and make it
 * yours before this ships — it was drafted from the stated purpose of the
 * product, not from an interview.
 */
const FOUNDER: {
  name: string;
  title: string;
  location: string;
  /** user_profiles.user_id for handle jwill86. */
  profileId: string;
  fallbackPhoto: string;
  linkedin: string | null;
  x: string | null;
} = {
  name: "Juan Williams",
  title: "Chief Vibe Officer",
  location: "Kansas City",
  profileId: "7a01495d-983a-4726-a6a5-5693865d20a0",
  fallbackPhoto: "/about/juan-williams.jpg",
  linkedin: null,
  x: null,
};

export const revalidate = 3600;

type FounderProfile = {
  avatar_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  youtube_url: string | null;
};

/** Same public view the guide bylines read; null on any failure. */
async function getFounderProfile(): Promise<FounderProfile | null> {
  try {
    const { data, error } = await supabase
      .from("public_guide_authors")
      .select("avatar_url, instagram_url, tiktok_url, website_url, youtube_url")
      .eq("author_id", FOUNDER.profileId)
      .maybeSingle();
    if (error) return null;
    return (data as FounderProfile | null) ?? null;
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: "About HappiTime — Who Runs It",
  description:
    "HappiTime is built and run in Kansas City by Juan Williams. Who is behind it, why it exists, and how to reach a person.",
  alternates: { canonical: "/about/" },
  openGraph: {
    title: "About HappiTime — Who Runs It",
    description: "HappiTime is built and run in Kansas City by Juan Williams.",
    url: "https://happitime.biz/about/",
  },
};

const DISPLAY = "heading-sans font-extrabold tracking-[-0.02em] leading-[1.15]";

export default async function AboutPage() {
  const profile = await getFounderProfile();
  const photo = profile?.avatar_url || FOUNDER.fallbackPhoto;

  const links = [
    { label: "Instagram", href: profile?.instagram_url },
    { label: "TikTok", href: profile?.tiktok_url },
    { label: "YouTube", href: profile?.youtube_url },
    { label: "Website", href: profile?.website_url },
    { label: "LinkedIn", href: FOUNDER.linkedin },
    { label: "X", href: FOUNDER.x },
  ].filter((l): l is { label: string; href: string } => !!l.href);

  const ABOUT_JSONLD = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: "https://happitime.biz/about/",
    name: "About HappiTime",
    mainEntity: {
      "@type": "Person",
      name: FOUNDER.name,
      jobTitle: FOUNDER.title,
      worksFor: { "@id": "https://happitime.biz/#organization" },
      homeLocation: { "@type": "City", name: "Kansas City" },
      image: photo.startsWith("/") ? `https://happitime.biz${photo}` : photo,
      ...(links.length ? { sameAs: links.map((l) => l.href) } : {}),
    },
  };

  return (
    <>
      <PageTracker pagePath="/about/" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ABOUT_JSONLD) }}
      />
      <article className="mx-auto max-w-[var(--width-narrow)] px-6 py-14 md:py-20">
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-brand-dark-alt">
          About
        </p>
        <h1 className={`${DISPLAY} mb-8 text-balance text-[clamp(2rem,5vw,3rem)]`}>
          There is a person behind this.
        </h1>

        {/* Founder card */}
        <div className="flex flex-col items-start gap-5 rounded-xl border border-border bg-surface p-6 shadow-md sm:flex-row sm:items-center md:p-7">
          {/* Plain <img>: a raw Supabase Storage avatar, same as the guide bylines. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt={`${FOUNDER.name}, ${FOUNDER.title} of HappiTime`}
            width={112}
            height={112}
            className="size-28 shrink-0 rounded-full bg-cream object-cover"
          />
          <div>
            <p className="m-0 text-[22px] font-extrabold leading-tight">{FOUNDER.name}</p>
            <p className="mt-1 text-[15px] text-muted">
              {FOUNDER.title}, HappiTime · {FOUNDER.location}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              <a href="mailto:admin@happitime.biz" className="text-brand-dark-alt hover:underline">
                admin@happitime.biz
              </a>
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="me noopener noreferrer"
                  className="text-brand-dark-alt hover:underline"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <section className="mt-12">
          <h2 className={`${DISPLAY} mb-4 text-[24px]`}>Why I built this</h2>
          <div className="space-y-4 text-pretty text-[16.5px] leading-[1.65] text-muted">
            <p>
              HappiTime does one job. It puts the person deciding where to go tonight and the bar
              with open stools in front of each other.
            </p>
            <p>
              People going out should not have to guess whether a happy hour is still on. Bars
              should not have to guess whether anybody saw it. I built HappiTime to sit in the
              middle and take the guessing out of both sides.
            </p>
            <p>
              I build and run it myself, here in Kansas City. If a listing is wrong, or you own a
              bar and want to talk, the email above reaches a person.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className={`${DISPLAY} mb-4 text-[24px]`}>What you can hold us to</h2>
          <ul className="list-disc space-y-2.5 pl-5 text-pretty text-[15.5px] text-muted">
            <li>
              Kansas City only, both sides of the state line. We would rather know one city well.
            </li>
            <li>Free for people going out. Free to be listed if you run a bar or restaurant.</li>
            <li>
              Venue plans are month-to-month, with the prices published —{" "}
              <a href="/pricing/" className="font-semibold text-brand-dark-alt hover:underline">
                see what it costs
              </a>
              .
            </li>
            <li>
              When we tell a venue we sent them people, we show{" "}
              <a
                href="/how-we-count-visits/"
                className="font-semibold text-brand-dark-alt hover:underline"
              >
                how we counted
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="mt-12 border-t border-border pt-8 text-[14.5px] text-muted">
          <p>
            HappiTime is operated by Williams Consulting &amp; Management LLC, Kansas City,
            Missouri. Reach us at{" "}
            <a href="mailto:admin@happitime.biz" className="font-semibold text-brand-dark-alt hover:underline">
              admin@happitime.biz
            </a>{" "}
            or through the{" "}
            <a href="/contactus/" className="font-semibold text-brand-dark-alt hover:underline">
              contact page
            </a>
            .
          </p>
        </section>
      </article>
    </>
  );
}
