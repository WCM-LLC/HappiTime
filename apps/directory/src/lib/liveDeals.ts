import { getAllKCVenues } from "@/lib/queries";
import type { LiveDeal } from "@/components/ForkOpener";

/* The opener's headline reads "in Kansas City", so every time calculation here
   runs in KC's timezone — not the visitor's. Someone opening the site from
   Denver should still be told what is pouring in KC right now. */
const KC_TZ = "America/Chicago";
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function kcNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KC_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Some ICU builds emit "24" for midnight with hour12:false.
  const hour = Number(get("hour")) % 24;
  return { dow: DOW[get("weekday")] ?? 0, minutes: hour * 60 + Number(get("minute")) };
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function formatClock(minutes: number) {
  const h24 = Math.floor(minutes / 60) % 24;
  const h = h24 % 12 || 12;
  return `${h}:${String(minutes % 60).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

/* Window labels are frequently a schedule ("Daily", "Mon-Fri") rather than a
   description of the deal, which reads as nonsense in a ticker of specials. An
   actual menu item beats a schedule word; the generic line beats both. */
const SCHEDULE_LABEL = /^(daily|everyday|every day|happy hour|all day|weekdays?|mon\W*fri)$/i;

function dealLabel(label: string | null, menuItem: string | undefined) {
  const l = label?.trim();
  const m = menuItem?.trim();
  if (l && !SCHEDULE_LABEL.test(l)) return l;
  if (m) return m;
  return "Happy hour on now";
}

/**
 * Happy hours running in Kansas City right now, soonest to end first.
 *
 * The source design shipped a hardcoded DEALS array naming real KC venues with
 * invented specials. Those are real businesses, so this reads from live venue
 * data instead — an empty ticker is better than a fabricated one.
 */
export function toLiveDeals(venues: Awaited<ReturnType<typeof getAllKCVenues>>): LiveDeal[] {
  const { dow, minutes } = kcNowParts();

  return venues
    .flatMap((venue) =>
      venue.happy_hour_windows
        .filter((w) => w.dow.includes(dow))
        .filter((w) => minutes >= toMinutes(w.start_time) && minutes <= toMinutes(w.end_time))
        .map((w) => ({
          id: `${venue.id}-${w.id}`,
          venue: venue.name,
          slug: venue.slug,
          hood: venue.neighborhood ?? venue.city,
          deal: dealLabel(w.label, w.menu_items[0]?.name),
          endsAt: formatClock(toMinutes(w.end_time)),
          endsIn: toMinutes(w.end_time) - minutes,
        }))
    )
    .sort((a, b) => a.endsIn - b.endsIn);
}

/** Everything the opener needs, resilient to the venue query failing. */
export async function getOpenerProps() {
  let all: LiveDeal[] = [];
  try {
    all = toLiveDeals(await getAllKCVenues());
  } catch {
    // The fork is the point; a missing ticker must never take the page down.
  }

  const { minutes } = kcNowParts();
  return {
    deals: all.slice(0, 4),
    liveCount: all.length,
    firstEndsAt: all[0]?.endsAt ?? null,
    initialClock: formatClock(minutes),
    initialMinutes: minutes,
  };
}
