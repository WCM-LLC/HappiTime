import Link from "next/link";
import type { HappyHourWindow, VenueWithWindows } from "@/lib/queries";
import { venuePath } from "@/lib/neighborhoods";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/** Monday-first position, so a Friday–Sunday run reads as one range. */
const weekPos = (d: number) => (d + 6) % 7;

/** [1,2,3,4,5] → "Monday to Friday"; [5,6,0] → "Friday to Sunday"; [1,3] → "Monday and Wednesday". */
export function formatDays(dow: number[]): string {
  const days = [...new Set(dow.map(Number))].filter((d) => d >= 0 && d <= 6).sort((a, b) => weekPos(a) - weekPos(b));
  if (days.length === 7) return "every day";
  if (days.length === 0) return "";
  const runs: number[][] = [];
  for (const d of days) {
    const run = runs[runs.length - 1];
    if (run && weekPos(d) === weekPos(run[run.length - 1]) + 1) run.push(d);
    else runs.push([d]);
  }
  const parts = runs.flatMap((r) =>
    r.length >= 3 ? [`${DAY_NAMES[r[0]]} to ${DAY_NAMES[r[r.length - 1]]}`] : r.map((d) => DAY_NAMES[d]),
  );
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2).replace(/\.00$/, "")}`;
}

/** " Specials include $5 House Margarita and $6 Street Tacos." — cheapest three, or "". */
function specialsSentence(windows: HappyHourWindow[]): string {
  const seen = new Set<string>();
  const items = windows
    .flatMap((w) => w.menu_items)
    .filter((i) => i.price != null && i.price > 0 && !seen.has(i.name) && seen.add(i.name))
    .sort((a, b) => a.price! - b.price!)
    .slice(0, 3)
    .map((i) => `${formatPrice(i.price!)} ${i.name.trim()}`);
  if (items.length === 0) return "";
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  return ` Specials include ${list}.`;
}

function earliestStart(windows: HappyHourWindow[]): string {
  return windows.map((w) => w.start_time).sort()[0] ?? "99:99";
}

/**
 * The published happy hour times of the venues a guide covers, one short
 * sentence per venue, each linking to the venue's page. Built from the same
 * published windows the venue pages show, so the guide's numbers stay current.
 */
export function GuideSchedule({
  heading,
  answer,
  venues,
  day,
  limit = 30,
  showSpecials = false,
  showAddress = false,
}: {
  /** Phrase it as the reader's question. */
  heading: string;
  /** One-sentence direct answer, shown first under the heading. */
  answer: string;
  venues: VenueWithWindows[];
  /** Only windows on this day (0 = Sunday). */
  day?: number;
  limit?: number;
  /** Add up to three priced specials per venue (needs menu items attached). */
  showSpecials?: boolean;
  /** Street address after the name — useful when the guide is a walkable route. */
  showAddress?: boolean;
}) {
  const allRows = venues
    .map((v) => ({
      venue: v,
      windows: v.happy_hour_windows.filter((w) => day === undefined || w.dow.map(Number).includes(day)),
    }))
    .filter((r) => r.windows.length > 0)
    .sort(
      (a, b) =>
        earliestStart(a.windows).localeCompare(earliestStart(b.windows)) ||
        a.venue.name.localeCompare(b.venue.name),
    );
  const rows = allRows.slice(0, limit);

  if (rows.length === 0) return null;

  // Counted from the data at render time, so the numbers can't go stale.
  const windows = allRows.flatMap((r) => r.windows);
  // Times arrive as "HH:MM:SS"; compare on "HH:MM" so 19:00:00 counts as 7 PM.
  const hhmm = (t: string) => t.slice(0, 5);
  const afternoon = windows.filter((w) => hhmm(w.start_time) >= "14:00" && hhmm(w.start_time) < "17:00").length;
  const endBySeven = windows.filter((w) => hhmm(w.end_time) >= "12:00" && hhmm(w.end_time) <= "19:00").length;
  const counts =
    `On HappiTime, ${allRows.length} ${allRows.length === 1 ? "spot publishes" : "spots publish"} ${windows.length} happy ${windows.length === 1 ? "hour" : "hours"}. ` +
    `${afternoon} of them start between 2 PM and 5 PM, and ${endBySeven} end by 7 PM.` +
    (rows.length < allRows.length ? ` The ${rows.length} that start earliest are listed below.` : "");

  return (
    <section className="mb-10">
      <h2 className="text-2xl font-bold text-foreground mb-3">{heading}</h2>
      <p className="text-muted leading-relaxed mb-4">
        {answer} {counts}
      </p>
      <ul className="space-y-2 text-muted leading-relaxed">
        {rows.map(({ venue, windows }) => (
          <li key={venue.id}>
            <Link href={venuePath(venue)} className="font-semibold text-foreground hover:text-brand">
              {venue.name}
            </Link>
            {showAddress && venue.address ? `, ${venue.address.split(",")[0]}` : null}
            {": "}
            {windows
              .map((w) => {
                const when = day === undefined ? `${formatDays(w.dow)}, ` : "";
                return `${when}${formatTime(w.start_time)} to ${formatTime(w.end_time)}`;
              })
              .join("; ")}
            .{showSpecials ? specialsSentence(windows) : null}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-light mt-4">
        Times are the published happy hours on each venue&apos;s HappiTime page. Bars change them, so check the
        venue page before you go.
      </p>
    </section>
  );
}
