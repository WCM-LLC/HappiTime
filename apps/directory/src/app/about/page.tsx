import type { Metadata } from "next";
import { PageTracker } from "@/components/PageTracker";

/**
 * ABOUT — who runs HappiTime.
 *
 * /about/ used to 404 and the only identity on the site was an LLC name in the
 * legal pages. At this stage the founder is the brand, so this page puts a
 * name (and, once added, a face) on it.
 *
 * ── Things only Juan can supply — fill in FOUNDER below ─────────────────────
 *   photo     Drop a square headshot at apps/directory/public/about/juan-williams.jpg
 *             and set photo: "/about/juan-williams.jpg". Until then the page
 *             shows initials, not a stock image.
 *   linkedin  Full profile URL. Left null → the link is simply not rendered.
 *   x         Full profile URL. Same.
 * The "why I built this" copy speaks in the first person. Read it and make it
 * yours before this ships — it was drafted from the stated purpose of the
 * product, not from an interview.
 */
const FOUNDER: {
  name: string;
  title: string;
  location: string;
  photo: string | null;
  linkedin: string | null;
  x: string | null;
} = {
  name: "Juan Williams",
  title: "Chief Vibe Officer",
  location: "Kansas City",
  photo: null,
  linkedin: null,
  x: null,
};

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

const sameAs = [FOUNDER.linkedin, FOUNDER.x].filter((u): u is string => !!u);

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
    ...(FOUNDER.photo ? { image: `https://happitime.biz${FOUNDER.photo}` } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AboutPage() {
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
          {FOUNDER.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={FOUNDER.photo}
              alt={`${FOUNDER.name}, ${FOUNDER.title} of HappiTime`}
              width={112}
              height={112}
              className="size-28 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex size-28 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-3xl font-black text-brand-dark-alt"
            >
              {initials(FOUNDER.name)}
            </div>
          )}
          <div>
            <p className="m-0 text-[22px] font-extrabold leading-tight">{FOUNDER.name}</p>
            <p className="mt-1 text-[15px] text-muted">
              {FOUNDER.title}, HappiTime · {FOUNDER.location}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              <a href="mailto:admin@happitime.biz" className="text-brand-dark-alt hover:underline">
                admin@happitime.biz
              </a>
              {FOUNDER.linkedin ? (
                <a
                  href={FOUNDER.linkedin}
                  target="_blank"
                  rel="me noopener noreferrer"
                  className="text-brand-dark-alt hover:underline"
                >
                  LinkedIn
                </a>
              ) : null}
              {FOUNDER.x ? (
                <a
                  href={FOUNDER.x}
                  target="_blank"
                  rel="me noopener noreferrer"
                  className="text-brand-dark-alt hover:underline"
                >
                  X
                </a>
              ) : null}
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
