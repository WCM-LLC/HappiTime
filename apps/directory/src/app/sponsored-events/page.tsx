import type { Metadata } from "next";
import Link from "next/link";
import { PageTracker } from "@/components/PageTracker";

export const metadata: Metadata = {
  title: "Sponsored Events — Kansas City Events Powered by HappiTime",
  description:
    "Kansas City brunches, day parties and community nights HappiTime powers with local hosts and partners. RSVP, then check in with the HappiTime app.",
  alternates: { canonical: "/sponsored-events/" },
  openGraph: {
    title: "Sponsored Events — HappiTime",
    description:
      "Kansas City events HappiTime powers with local hosts and partners.",
    url: "https://happitime.biz/sponsored-events/",
  },
};

// Re-render hourly so an event moves to "Past" on its own after it ends.
export const revalidate = 3600;

type SponsoredEvent = {
  slug: string;
  title: string;
  edition?: string;
  hosts: string;
  partners: string[];
  /** ISO timestamps with Central offset. */
  starts: string;
  ends: string;
  dateLabel: string;
  timeLabel: string;
  area: string;
  access: "Invitation only" | "Open RSVP" | "Open registration";
  /** Button label; defaults to "RSVP for your seat". */
  cta?: string;
  /** Postponed events stay in the upcoming list with no RSVP button. */
  status?: "postponed";
  blurb: string;
  image: string;
  imageAlt: string;
};

const EVENTS: SponsoredEvent[] = [
  {
    slug: "tacos-and-tables",
    title: "Tacos & Tables",
    edition: "with Good Company",
    hosts: "Spades tournament night",
    partners: ["HappiTime", "Tacos Valentina", "NotCho' Taco", "DJ Stixx"],
    starts: "2026-10-13T17:00:00-05:00",
    ends: "2026-10-13T21:30:00-05:00",
    dateLabel: "Tuesday, October 13",
    timeLabel: "Doors 5 PM, first deal 6 PM",
    area: "Crossroads",
    access: "Open registration",
    cta: "Register your spot",
    blurb:
      "A 16-team double-elimination Spades tournament at In Good Company. $20 per player, solo or with a partner. Tacos from the NotCho' Taco truck outside, music by DJ Stixx. Register by October 12.",
    image: "/sponsored-events/tacos-and-tables/cover.jpg",
    imageAlt: "A playing card reading Tacos & Tables, with the 13 of spades in the corners.",
  },
  {
    slug: "social-life-brunch",
    title: "The Social Life Brunch",
    edition: "Fall Edition",
    hosts: "The Blacklist × MEPA",
    partners: ["HappiTime", "Hennessy", "Don Julio"],
    // Was Sunday Oct 11; pushed back 2026-10-09. Restore the real dates and drop
    // `status` once the new date is confirmed.
    starts: "2026-10-11T11:30:00-05:00",
    ends: "2026-10-11T16:00:00-05:00",
    dateLabel: "New date to be announced",
    timeLabel: "Brunch × day party",
    area: "18th & Vine",
    access: "Invitation only",
    status: "postponed",
    blurb:
      "An exclusive brunch × day party for people shaping Kansas City's business, community and culture. The Fall Edition has moved off October 11; a new date is being set and existing RSVPs carry over. Dress code: shades of brown and blue.",
    image: "/sponsored-events/social-life-brunch/portrait.jpg",
    imageAlt: "A guest in a champagne satin blouse, chin resting on her hand.",
  },
];

const SHELL = "mx-auto max-w-5xl px-6";
const DISPLAY = "heading-sans font-extrabold tracking-[-0.02em] leading-[1.15]";

function EventCard({ e, past }: { e: SponsoredEvent; past?: boolean }) {
  const href = `/sponsored-events/${e.slug}/`;
  return (
    <article className="grid overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Link href={href} className="block bg-cream" tabIndex={-1} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- local asset, outside the Cloudinary loader */}
        <img
          src={e.image}
          alt={e.imageAlt}
          className={`h-full max-h-[340px] w-full object-cover object-[50%_25%] sm:max-h-none ${past ? "grayscale" : ""}`}
          loading="lazy"
        />
      </Link>
      <div className="flex min-w-0 flex-col gap-3 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em]">
          <span className="rounded-full bg-brand-subtle px-3 py-1 text-brand-dark-alt">{e.access}</span>
          {e.status === "postponed" && (
            <span className="rounded-full bg-dark px-3 py-1 text-white">Postponed</span>
          )}
          <span className="text-muted">{e.hosts}</span>
        </div>
        <h2 className={`${DISPLAY} text-[clamp(1.6rem,3vw,2.1rem)]`}>
          <Link href={href} className="hover:text-brand-dark">
            {e.title}
            {e.edition && <span className="text-muted"> · {e.edition}</span>}
          </Link>
        </h2>
        <p className="text-[15px] font-semibold tabular-nums">
          {e.dateLabel} · {e.timeLabel} · {e.area}
        </p>
        <p className="max-w-[60ch] text-pretty text-[15px] text-muted">{e.blurb}</p>
        <p className="text-[13px] text-muted">
          Powered by {e.partners.join(" · ")}
        </p>
        <div className="mt-auto pt-2">
          {past ? (
            <span className="text-[14px] font-semibold text-muted">This event has ended.</span>
          ) : e.status === "postponed" ? (
            <Link href={href} className="text-[14px] font-semibold text-muted hover:text-brand-dark">
              RSVPs reopen once the new date is set. Details &rarr;
            </Link>
          ) : (
            <Link
              href={href}
              className="inline-block rounded-full bg-dark px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-black"
            >
              {e.cta ?? "RSVP for your seat"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export default function SponsoredEventsPage() {
  const now = Date.now();
  // Postponed events never age into "Past"; they list after the dated ones.
  const isUpcoming = (e: SponsoredEvent) => e.status === "postponed" || Date.parse(e.ends) >= now;
  const upcoming = EVENTS.filter(isUpcoming).sort((a, b) => {
    if ((a.status === "postponed") !== (b.status === "postponed")) return a.status === "postponed" ? 1 : -1;
    return Date.parse(a.starts) - Date.parse(b.starts);
  });
  const past = EVENTS.filter((e) => !isUpcoming(e)).sort(
    (a, b) => Date.parse(b.starts) - Date.parse(a.starts),
  );

  return (
    <>
      <PageTracker pagePath="/sponsored-events/" />
      <header className="pt-16 pb-8">
        <div className={SHELL}>
          <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.06em] text-brand-dark-alt">
            Sponsored events
          </p>
          <h1 className={`${DISPLAY} mb-4 text-balance text-[clamp(2.2rem,5vw,3.2rem)]`}>
            Kansas City nights we&rsquo;re proud to power
          </h1>
          <p className="max-w-[620px] text-pretty text-[17px] text-muted">
            HappiTime partners with local hosts on brunches, day parties and community
            nights. RSVP here, then check in at the door with the HappiTime app.
          </p>
        </div>
      </header>

      <section className={`${SHELL} grid gap-6 pb-12`} aria-label="Upcoming events">
        {upcoming.length ? (
          upcoming.map((e) => <EventCard key={e.slug} e={e} />)
        ) : (
          <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-muted">
            No sponsored events on the calendar right now. Check back soon.
          </p>
        )}
      </section>

      {past.length > 0 && (
        <section className={`${SHELL} grid gap-6 pb-16`} aria-labelledby="past-events">
          <h2 id="past-events" className={`${DISPLAY} text-[22px]`}>
            Past events
          </h2>
          {past.map((e) => (
            <EventCard key={e.slug} e={e} past />
          ))}
        </section>
      )}
    </>
  );
}
