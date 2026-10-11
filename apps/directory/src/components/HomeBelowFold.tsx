import Link from "next/link";
import { HAPPY_HOUR_LANDING_PAGES, getNeighborhoodForLandingPage } from "@/lib/seoNeighborhoods";
import { VenueQuotes } from "@/components/VenueQuotes";
import { PressStrip } from "@/components/PressStrip";

/**
 * Everything on the homepage below the fork and the live list.
 *
 * The opener used to be the whole page: pick a door or leave. This gives the
 * visitor who is not ready for either door somewhere to go — the neighborhood
 * pages, the guides — and gives venue owners a plain second route to pricing.
 */
export function HomeBelowFold({ venueCount }: { venueCount: number }) {
  const neighborhoods = HAPPY_HOUR_LANDING_PAGES.map((page) => ({
    href: page.canonicalPath,
    name: getNeighborhoodForLandingPage(page)?.name ?? page.h2,
  }));

  return (
    <div className="flex flex-col gap-14 px-6 pb-4 md:px-12">
      {/* Real quotes only — empty until lib/socialProof.ts has one. */}
      <VenueQuotes heading="From the bars on HappiTime" max={3} />

      {/* Neighborhood pages */}
      <section aria-labelledby="home-neighborhoods" className="border-t border-border pt-10">
        <h2
          id="home-neighborhoods"
          className="heading-sans m-0 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] md:text-[30px]"
        >
          Pick a neighborhood
        </h2>
        <p className="mt-2 max-w-[560px] text-pretty text-base text-muted">
          {venueCount} spots across {neighborhoods.length} parts of town, on both sides of the
          state line. Every page shows what is on today and when it ends.
        </p>
        <ul className="mt-6 grid list-none grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {neighborhoods.map((n) => (
            <li key={n.href}>
              <a
                href={n.href}
                className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground transition-colors duration-fast hover:border-brand hover:text-brand-dark"
              >
                {n.name}
                <span aria-hidden="true" className="text-muted-light">
                  &#8594;
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
          <Link href="/kc/" className="text-brand-dark hover:underline">
            See all {venueCount} on the map &#8594;
          </Link>
          <Link href="/guides/" className="text-brand-dark hover:underline">
            Not going out tonight? Read the guides &#8594;
          </Link>
        </div>
      </section>

      {/* For venues */}
      <section
        aria-labelledby="home-venues"
        className="rounded-xl bg-dark px-7 py-9 text-dark-foreground md:px-11 md:py-11"
      >
        <p className="m-0 text-xs font-extrabold uppercase tracking-[0.1em] text-brand-light">
          For KC bars &amp; restaurants
        </p>
        <h2
          id="home-venues"
          className="heading-sans mt-3 max-w-[620px] text-balance text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-white md:text-[30px]"
        >
          Stop guessing what marketing does.
        </h2>
        <p className="mt-3 max-w-[600px] text-pretty text-base text-dark-muted">
          {venueCount} Kansas City spots are already listed on HappiTime. A listing is free.
          Paid plans rank you higher and show you which nights we put people on your stools —
          $49 or $99 a month, month-to-month, cancel anytime.
        </p>

        <VenueQuotes heading="From an owner" max={1} tone="dark" className="mt-7 max-w-[600px]" />

        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3.5">
          <a
            href="/pricing/"
            className="inline-block rounded-full bg-brand px-[26px] py-3 text-[15px] font-bold text-white transition-colors duration-normal hover:bg-brand-dark"
          >
            See what it costs
          </a>
          <a
            href="/how-we-count-visits/"
            className="text-sm font-semibold text-brand-light hover:underline"
          >
            How we count a visit &#8594;
          </a>
        </div>
        <p className="mt-6 max-w-[600px] text-[13px] text-dark-muted">
          Kansas City metro only for now, Missouri and Kansas sides. If your bar is somewhere
          else, HappiTime is not for you yet.
        </p>
      </section>

      <PressStrip />
    </div>
  );
}
