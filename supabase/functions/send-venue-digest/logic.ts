// supabase/functions/send-venue-digest/logic.ts
//
// Pure decision helpers for the send-venue-digest edge function.
// Separated from the HTTP handler so unit tests can import without
// triggering Deno.serve (which requires --allow-net).
//
// All functions are stateless and have no side effects.

export { serviceDate } from "../_shared/checkin-code.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Subject formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the exact locked subject line format:
 *   "Today's HappiTime code: {CODE} · {N} check-ins yesterday"
 * The separator is U+00B7 MIDDLE DOT with one space on each side.
 * Count format is not pluralised (0 check-ins, 1 check-ins, N check-ins).
 */
export function formatDigestSubject(code: string, checkinCount: number): string {
  return `Today's HappiTime code: ${code} · ${checkinCount} check-ins yesterday`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 AM CT guard (DST-safe)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when `now` is within the 6:00 AM hour in America/Chicago
 * (i.e. hour === 6, minute 0–59).  Survives DST without cron edits:
 *   - Summer (CDT = UTC-5): 6am CT = 11:00 UTC
 *   - Winter (CST = UTC-6): 6am CT = 12:00 UTC
 * Both map to hour=6 in America/Chicago, so the cron fires at 00:00 UTC
 * every hour and this guard lets exactly one window through.
 */
export function isSixAmCentral(now: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  return h === 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Venue scoping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns only the venues whose org has at least one team member who can
 * receive an email (see RECIPIENT_ROLES). Scoping here, before the per-venue
 * loop, keeps the function from iterating the entire published-venue directory
 * (~174 venues, each costing serial lookups), which exhausted the edge-function
 * wall-clock and returned a 504. Output-preserving: an org with no recipients
 * was already skipped inside the loop.
 *
 * @param venues   published venues (each with an `org_id`)
 * @param members  org_members rows pre-filtered to RECIPIENT_ROLES
 */
export function venuesToProcess<T extends { org_id: string | null }>(
  venues: T[],
  members: { org_id: string | null }[],
): T[] {
  const claimedOrgIds = new Set(
    members
      .map((m) => m.org_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  return venues.filter((v) => v.org_id != null && claimedOrgIds.has(v.org_id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipient resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Roles that receive the full digest (code + yesterday's stats). */
export const DIGEST_ROLES = ["owner", "manager"] as const;
/** Roles that receive the code-only email. */
export const CODE_ONLY_ROLES = ["host"] as const;
/** Every role that gets an email. Legacy roles (admin/editor/viewer) do not. */
export const RECIPIENT_ROLES: readonly string[] = [...DIGEST_ROLES, ...CODE_ONLY_ROLES];

/** Higher wins when one person holds two seats in the same org. */
const ROLE_RANK: Record<string, number> = { owner: 3, manager: 2, host: 1 };

export type MemberRow = { user_id: string; email: string | null; role: string };

export type Recipient = {
  userId: string;
  email: string;
  role: string;
  kind: "digest" | "code";
};

/**
 * Turns an org's member rows into the list of people to email for one venue.
 *
 *   - owner / manager → kind "digest"; host → kind "code"
 *   - one email per person: the highest-ranked seat wins
 *   - members with no email are dropped (the caller resolves the auth-layer
 *     fallback before calling this)
 *   - `optedOutUserIds` = users whose notifications_venue_scans is false;
 *     a missing preference row means opted in, so it is simply absent here
 *
 * Output order follows first appearance in `members`, so callers that order
 * by created_at get owners-first for free without depending on it.
 */
export function recipientsForVenue(
  members: MemberRow[],
  optedOutUserIds: Set<string>,
): Recipient[] {
  const byUser = new Map<string, Recipient>();
  for (const m of members) {
    if (!RECIPIENT_ROLES.includes(m.role)) continue;
    if (!m.email) continue;
    if (optedOutUserIds.has(m.user_id)) continue;
    const existing = byUser.get(m.user_id);
    if (existing && ROLE_RANK[existing.role] >= ROLE_RANK[m.role]) continue;
    byUser.set(m.user_id, {
      userId: m.user_id,
      email: m.email,
      role: m.role,
      kind: (DIGEST_ROLES as readonly string[]).includes(m.role) ? "digest" : "code",
    });
  }
  return [...byUser.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Host (code-only) email
// ─────────────────────────────────────────────────────────────────────────────

/** Subject for the host email. Names the venue so a host at two bars can tell them apart. */
export function formatHostSubject(code: string, venueName: string): string {
  return `Today's HappiTime code for ${venueName}: ${code}`;
}

/** Body for the host email: venue, code, validity note. No stats, no console CTA. */
export function buildCodeOnlyHtml(args: { venueName: string; code: string }): string {
  const { venueName, code } = args;
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="color:#C0773A;margin-bottom:4px">HappiTime Daily Code</h2>
  <p style="color:#555;margin-top:0">${venueName}</p>

  <div style="background:#f9f5ef;border-radius:12px;padding:20px 24px;margin:20px 0;text-align:center">
    <p style="margin:0 0 4px;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px">Today's Check-In Code</p>
    <p style="margin:0;font-size:40px;font-weight:700;letter-spacing:6px;color:#1a1a1a;font-family:monospace">${code}</p>
    <p style="margin:8px 0 0;color:#aaa;font-size:12px">Post this at your bar — valid until 6 AM tomorrow (CT)</p>
  </div>

  <p style="color:#aaa;font-size:11px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
    You're receiving this because you're on the team at ${venueName} on HappiTime.
  </p>
</div>
  `.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Zero-email self-check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the run sent zero emails but there is at least one active
 * (published) venue — a contractual reliability violation that must be alerted.
 *
 * NOTE: this should only be evaluated AFTER the 6am guard passes. Non-6am runs
 * legitimately send 0 emails (they exit early) and must NOT trigger this check.
 */
export function shouldAlertZeroSent(emailsSent: number, activeVenueCount: number): boolean {
  return emailsSent === 0 && activeVenueCount > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Yesterday's service-date window (for round_redemptions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the UTC [start, end) instants bounding yesterday's service date.
 * The service date flips at 6:00 AM America/Chicago, so:
 *   start = yesterday 06:00 CT expressed in UTC
 *   end   = today     06:00 CT expressed in UTC
 *
 * We compute by finding today's 6am CT in UTC (= the serviceDate flip instant),
 * then subtracting 24 h.  DST-safe because Intl.DateTimeFormat locates the
 * wall-clock 6am in the correct offset for each date.
 */
export function yesterdayServiceWindow(now: Date): { start: Date; end: Date } {
  // Find today's 6 AM CT as a UTC epoch.
  // Strategy: format now in CT to get YYYY-MM-DD, then build an Intl-resolved
  // timestamp for 06:00 that day in America/Chicago.
  const ctFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayCtStr = ctFormatter.format(now); // "YYYY-MM-DD"

  // Parse "today 06:00 CT" by binary search is overkill; use a robust approach:
  // create a Date from the ISO string with timezone offset inferred from CT.
  // We leverage the fact that `new Date(isoString)` interprets Z or +HH:MM.
  // Instead, we use the known-reliable method: shift the epoch.
  //
  // Find "today 06:00 CT" epoch = find the UTC moment when CT wall clock is
  // exactly todayCtStr 06:00:00.
  // We do this by constructing a UTC date for todayCtStr 06:00 and then
  // adjusting by the CT offset (from the Intl API on that constructed date).
  const todaySixAmUtcApprox = new Date(`${todayCtStr}T06:00:00Z`);

  // Get actual CT offset at that approximate moment (may be CDT or CST)
  const tzFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZoneName: "shortOffset",
  });
  const offsetStr = tzFmt.formatToParts(todaySixAmUtcApprox)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT-6";
  // offsetStr is like "GMT-5" (CDT) or "GMT-6" (CST)
  const offsetMatch = offsetStr.match(/GMT([+-]\d+)/);
  const ctOffsetHours = offsetMatch ? parseInt(offsetMatch[1], 10) : -6;

  // today 06:00 CT in UTC = 06:00 UTC - ctOffset = (6 - ctOffset) UTC
  const todaySixAmUtc = new Date(`${todayCtStr}T${String(6 - ctOffsetHours).padStart(2, "0")}:00:00Z`);

  // yesterday 06:00 CT = todaySixAmUtc - 24h (DST-safe: clock-day boundary is irrelevant)
  const yesterdaySixAmUtc = new Date(todaySixAmUtc.getTime() - 24 * 3600_000);

  return { start: yesterdaySixAmUtc, end: todaySixAmUtc };
}
