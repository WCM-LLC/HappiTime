// apps/web/src/utils/scan-analytics.mjs
//
// Pure helpers for the venue "Scan activity" card. Plain ESM (.mjs, see the
// scan-analytics.d.ts for types) so CI's Node 20 can execute the unit tests
// directly (no type-stripping). No I/O — windows and `now` are passed in.

const RECENT_LIMIT = 30;

/** { todayStart, weekStart, monthStart } ISO boundaries for a venue timezone + now. */
export function computeWindows(timezone, now) {
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const monthStart = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  // Start of the current calendar day in the venue's timezone = now minus the
  // seconds elapsed since local midnight (robust across DST; no offset tables).
  let secsIntoDay =
    now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(now);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    secsIntoDay = get("hour") * 3600 + get("minute") * 60 + get("second");
  } catch {
    // invalid/missing timezone — keep the UTC-day fallback computed above
  }
  return {
    todayStart: new Date(now.getTime() - secsIntoDay * 1000).toISOString(),
    weekStart: weekStart.toISOString(),
    monthStart: monthStart.toISOString(),
  };
}

/** Aggregate the venue's last-30d events into window totals, per-source, and recent. */
export function summarizeScans(events, windows) {
  const bySource = { qr: 0, app_checkin: 0, push_click: 0, organic: 0 };
  const todayMs = new Date(windows.todayStart).getTime();
  const weekMs = new Date(windows.weekStart).getTime();
  const monthMs = new Date(windows.monthStart).getTime();
  let today = 0;
  let week = 0;
  let month = 0;
  const sorted = [...(events ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  for (const e of sorted) {
    const tMs = new Date(e.created_at).getTime();
    if (tMs >= monthMs) month++;
    if (tMs >= weekMs) week++;
    if (tMs >= todayMs) today++;
    if (Object.prototype.hasOwnProperty.call(bySource, e.source)) bySource[e.source]++;
  }
  return {
    today,
    week,
    month,
    bySource,
    recent: sorted.slice(0, RECENT_LIMIT).map((e) => ({
      source: e.source,
      created_at: e.created_at,
      handle: e.handle ?? null,
      display_name: e.display_name ?? null,
    })),
  };
}

/** Short relative time like "just now", "5m ago", "3h ago", "2d ago". */
export function formatRelativeTime(fromISO, now) {
  const s = Math.max(0, Math.floor((now.getTime() - new Date(fromISO).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
