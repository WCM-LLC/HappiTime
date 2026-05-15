/** Converts two 24-hour 'HH:MM[:SS]' strings from the DB into a human-readable 12-hour range like "4:00 PM - 6:30 PM". */
export function formatTimeRange(
  start?: string | null,
  end?: string | null
): string {
  if (!start || !end) return "";
  // Assumes 'HH:MM[:SS]' 24-hour strings coming from the DB
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const format = (h: number, m: number) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = ((h + 11) % 12) + 1;
    const mm = m.toString().padStart(2, "0");
    return `${hour12}:${mm} ${suffix}`;
  };

  return `${format(sh, sm)} - ${format(eh, em)}`;
}

// Assumption: dow uses 0–6 (Sun–Sat). If you're using 1–7, just shift the index.
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Formats a day-of-week array into a dot-separated label string like "Mon · Wed · Fri".
 * Accepts numeric (0–6, Sun–Sat) or string day values.
 */
export function formatDays(dow: (number | string)[]): string {
  if (!dow || dow.length === 0) return "No days set";

  const allNumbers = dow.every((value) => typeof value === "number");

  if (allNumbers) {
    return (dow as number[])
      .map((d) => DOW_LABELS[d] ?? `D${d}`)
      .join(" · ");
  }

  return dow
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => value.charAt(0).toUpperCase() + value.slice(1))
    .join(" · ");
}
