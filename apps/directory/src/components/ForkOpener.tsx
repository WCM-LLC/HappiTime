"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type LiveDeal = {
  id: string;
  venue: string;
  slug: string;
  hood: string;
  deal: string;
  endsAt: string;
  endsIn: number;
};

type Role = "deals" | "venues";

const DESTINATIONS: Record<Role, string> = { deals: "/kc/", venues: "/pricing/" };
const REMEMBER_KEY = "ht.role";
const KC_TZ = "America/Chicago";

/** Minutes past midnight in Kansas City, regardless of where the visitor is. */
function kcMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KC_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

function formatClock(minutes: number) {
  const h24 = Math.floor(minutes / 60) % 24;
  const h = h24 % 12 || 12;
  return `${h}:${String(minutes % 60).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

/**
 * The design bucketed this line purely by hour, which was fine when the deals
 * were hardcoded. Against live data that contradicts itself — at 7am it claimed
 * "nothing is pouring yet" directly above a ticker listing an active happy hour.
 * Real counts win; the hour buckets are the fallback for when nothing is on.
 */
function timeCopy(minutes: number, liveCount: number, firstEndsAt: string | null) {
  if (liveCount > 0 && firstEndsAt) {
    return liveCount === 1
      ? `One happy hour is running right now — it ends at ${firstEndsAt}.`
      : `${liveCount} happy hours are running right now. The first ends at ${firstEndsAt}.`;
  }
  const h = Math.floor(minutes / 60);
  if (h < 11) return "Nothing is pouring yet. Bookmark this and come back at three.";
  if (h < 15) return "Two hours until the first pours. Pick your spot early.";
  if (h < 19) return "Somewhere within a mile of you is pouring half-off. We know where.";
  if (h < 23) return "Late-night menus are live. The good ones run until close.";
  return "Last call is close, but a few kitchens are still open.";
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-[15px] shrink-0 animate-spin rounded-full border-2 border-brand-light border-t-brand"
    />
  );
}

export default function StartOpener({
  deals,
  liveCount,
  firstEndsAt,
  initialClock,
  initialMinutes,
}: {
  deals: LiveDeal[];
  liveCount: number;
  firstEndsAt: string | null;
  initialClock: string;
  initialMinutes: number;
}) {
  const router = useRouter();

  /* Server-rendered from KC time so the headline never flashes a placeholder.
     The page is ISR-cached, so that value can be up to a revalidate window old —
     the first client tick corrects it, and the clock span is marked
     suppressHydrationWarning because a mismatch here is expected, not a bug. */
  const [minutes, setMinutes] = useState(initialMinutes);
  const [clock, setClock] = useState(initialClock);
  const [pressing, setPressing] = useState<Role | null>(null);
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [remembered, setRemembered] = useState<Role | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const tick = () => {
      const m = kcMinutes();
      setMinutes(m);
      setClock(formatClock(m));
    };
    tick();
    const id = setInterval(tick, 20_000);

    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved === "deals" || saved === "venues") setRemembered(saved);
    } catch {
      // Private mode / storage disabled — the fork works fine without memory.
    }

    // Both doors lead somewhere real, so warm them up while the visitor decides.
    router.prefetch(DESTINATIONS.deals);
    router.prefetch(DESTINATIONS.venues);

    const pending = timers.current;
    return () => {
      clearInterval(id);
      pending.forEach(clearTimeout);
    };
  }, [router]);

  const go = useCallback(
    (role: Role) => {
      if (pressing) return;
      try {
        localStorage.setItem(REMEMBER_KEY, role);
      } catch {
        /* non-fatal */
      }

      if (prefersReducedMotion()) {
        router.push(DESTINATIONS[role]);
        return;
      }

      setPressing(role);
      setProgress(12);
      timers.current.push(
        setTimeout(() => {
          setProgress(46);
          setLeaving(true);
        }, 180),
        // Short enough that the animation reads as responsiveness, not a fake
        // loading screen — the real navigation does the rest.
        setTimeout(() => {
          setProgress(88);
          router.push(DESTINATIONS[role]);
        }, 420)
      );
    },
    [pressing, router]
  );

  const forget = () => {
    try {
      localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* non-fatal */
    }
    setRemembered(null);
  };

  const ticker = deals;
  const showTicker = ticker.length > 0;

  return (
    <div className="relative overflow-hidden">
      {/* Progress bar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[3px] transition-opacity duration-normal"
        style={{ opacity: progress > 0 ? 1 : 0 }}
      >
        <div
          className="h-full bg-brand shadow-[0_0_8px_rgba(200,150,90,0.6)] transition-[width] duration-slow ease-default"
          style={{ width: `${progress}%` }}
        />
      </div>

      {remembered && !leaving && (
        <div className="flex flex-wrap items-center gap-3 border-b border-brand-light bg-brand-subtle px-6 py-3 md:px-12">
          <span className="flex-1 text-sm text-brand-dark-alt">
            Welcome back. Last time you were{" "}
            {remembered === "venues" ? "here as a venue" : "looking for deals"}.
          </span>
          <button
            type="button"
            onClick={() => go(remembered)}
            className="rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-fast hover:bg-brand-dark"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={forget}
            className="rounded-full border border-brand-light px-3.5 py-2 text-[13px] font-semibold text-brand-dark-alt transition-colors duration-fast hover:bg-surface"
          >
            Not me
          </button>
        </div>
      )}

      <section
        className="flex flex-col justify-center gap-10 px-6 py-16 transition-[transform,opacity] duration-slow ease-default md:px-12 md:py-24"
        style={{
          transform: leaving ? `translateX(${pressing === "venues" ? 18 : -18}%)` : "translateX(0)",
          opacity: leaving ? 0 : 1,
        }}
      >
        {/* Clock line — the headline */}
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-end md:gap-12">
          <h1 className="heading-sans m-0 max-w-[660px] flex-1 text-[clamp(2.25rem,6vw,3.75rem)] font-bold leading-[1.04] tracking-[-0.035em] text-pretty">
            It is{" "}
            <span className="text-brand tabular-nums" suppressHydrationWarning>
              {clock}
            </span>{" "}
            in Kansas City.
          </h1>
          <p className="m-0 max-w-[340px] text-pretty text-[17px] leading-[1.5] text-muted md:mb-2 md:text-[19px]">
            {timeCopy(minutes, liveCount, firstEndsAt)}
          </p>
        </div>

        {/* The fork */}
        <div className="flex flex-col gap-[18px]">
          <span
            id="fork-label"
            className="text-xs font-extrabold uppercase tracking-[0.1em] text-muted-light"
          >
            So which one are you
          </span>

          <div
            role="group"
            aria-labelledby="fork-label"
            className="grid grid-cols-1 gap-5 md:grid-cols-2"
          >
            {/* Door 1 — drinkers */}
            <button
              type="button"
              onClick={() => go("deals")}
              disabled={pressing !== null}
              className="flex cursor-pointer flex-col gap-2.5 rounded-lg border border-brand-light bg-brand-subtle p-7 text-left transition-shadow duration-normal ease-default hover:shadow-xl disabled:cursor-default md:p-8"
            >
              <span className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[30px]">
                I am here for the drinks
              </span>
              <span className="text-base leading-[1.5] text-brand-dark-alt">
                Show me what is pouring near me, right now.
              </span>
              <span className="mt-2.5 flex items-center gap-2.5 text-sm font-semibold text-brand-dark">
                {pressing === "deals" && <Spinner />}
                {pressing === "deals"
                  ? "Opening the directory…"
                  : "Deals near me, sorted by what ends soonest"}
                {pressing !== "deals" && <span aria-hidden="true" className="text-[17px]">&#8594;</span>}
              </span>
            </button>

            {/* Door 2 — operators */}
            <button
              type="button"
              onClick={() => go("venues")}
              disabled={pressing !== null}
              className="flex cursor-pointer flex-col gap-2.5 rounded-lg border border-dark bg-dark p-7 text-left transition-colors duration-normal ease-default hover:bg-dark-surface disabled:cursor-default md:p-8"
            >
              <span className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] text-cream md:text-[30px]">
                I am the one pouring
              </span>
              <span className="text-base leading-[1.5] text-dark-muted">
                An empty stool at <span suppressHydrationWarning>{clock}</span> costs more than the
                discount.
              </span>
              <span className="mt-2.5 flex items-center gap-2.5 text-sm font-semibold text-brand-light">
                {pressing === "venues" && <Spinner />}
                {pressing === "venues"
                  ? "Loading plans…"
                  : "Fill the slow hours, see what it costs"}
                {pressing !== "venues" && (
                  <span aria-hidden="true" className="text-[17px]">&#8594;</span>
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Live ticker — real happy hours, soonest to end first */}
        {showTicker && (
          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-muted-light">
              <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-success" />
              Pouring right now
            </span>
            <ul className="flex flex-col gap-2 md:flex-row md:flex-wrap md:gap-x-8">
              {ticker.map((d) => (
                <li key={d.id} className="flex items-baseline gap-2 text-sm">
                  <a
                    href={`/v/${d.slug}/`}
                    className="font-semibold text-foreground hover:text-brand-dark"
                  >
                    {d.venue}
                  </a>
                  <span className="text-muted">{d.deal}</span>
                  <span className="text-muted-light">ends {d.endsAt}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
