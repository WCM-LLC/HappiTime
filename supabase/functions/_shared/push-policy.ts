// supabase/functions/_shared/push-policy.ts
//
// Pure push-throttling policy: a per-user DAILY CAP and QUIET HOURS, both on
// the America/Chicago calendar. No I/O — notify.ts reads the counts from
// user_notifications.pushed_at and asks this module what it may send.
//
// WHY (2026-09-15): consumer pushes were opened to every published venue on
// 2026-09-14 (push-gate.ts). A user following N venues can now get N
// "happy hour starting" pushes inside one hour, plus event / venue-update /
// friend pushes on top. This is the safety net before volume grows. The
// INBOX is never throttled — inbox rows are the source of truth and are
// always written; only the Expo push is suppressed.
//
// Defaults (overridable as edge-function secrets, no deploy needed):
//   PUSH_DAILY_CAP    = "4"     max pushes per user per Chicago calendar day
//   PUSH_QUIET_HOURS  = "22-9"  no pushes in [22:00, 09:00) Chicago local;
//                               "off" disables quiet hours entirely
// Unknown / malformed values fall back to the defaults with a console.warn so
// a typo cannot silently change behaviour in either direction.

import { localParts, zonedToUtc } from "./recurrence.ts";

export const DEFAULT_TZ = "America/Chicago";
export const DAILY_PUSH_CAP = 4;
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 9;

export type PushPolicy = {
  /** Max pushes per user per local calendar day. */
  dailyCap: number;
  /** Quiet window [start, end) in local hours, or null when disabled. */
  quiet: { startHour: number; endHour: number } | null;
  tz: string;
};

export const DEFAULT_POLICY: PushPolicy = {
  dailyCap: DAILY_PUSH_CAP,
  quiet: { startHour: QUIET_START_HOUR, endHour: QUIET_END_HOUR },
  tz: DEFAULT_TZ,
};

/**
 * True when `now` falls inside the quiet window in `tz`. The window is
 * [startHour:00, endHour:00) and may wrap midnight (22 → 9) or not (1 → 6).
 * startHour === endHour means a zero-length window (never quiet).
 */
export function isQuietHours(
  now: Date,
  tz: string = DEFAULT_TZ,
  startHour: number = QUIET_START_HOUR,
  endHour: number = QUIET_END_HOUR,
): boolean {
  const { h } = localParts(now, tz);
  if (startHour === endHour) return false;
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour; // wraps midnight
}

/** UTC instant of 00:00 local on `now`'s calendar day in `tz`. DST-safe. */
export function chicagoDayStart(now: Date, tz: string = DEFAULT_TZ): Date {
  const { y, m, d } = localParts(now, tz);
  return zonedToUtc({ y, m, d, h: 0, mi: 0, s: 0 }, tz);
}

/** How many more pushes this user may receive today. Never negative. */
export function allowedPushCount(alreadyPushedToday: number, cap: number = DAILY_PUSH_CAP): number {
  const used = Number.isFinite(alreadyPushedToday) ? Math.max(0, Math.floor(alreadyPushedToday)) : 0;
  const limit = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0;
  return Math.max(0, limit - used);
}

/**
 * Parses "22-9" / "22-09" / "off". Returns the window, null for "off", or
 * undefined when the value is malformed (caller falls back to defaults).
 */
export function parseQuietHours(
  raw: string | undefined | null,
): { startHour: number; endHour: number } | null | undefined {
  if (raw == null) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "") return undefined;
  if (v === "off" || v === "none" || v === "0") return null;
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(v);
  if (!m) return undefined;
  const startHour = Number(m[1]);
  const endHour = Number(m[2]);
  if (startHour > 23 || endHour > 23) return undefined;
  return { startHour, endHour };
}

/** Parses PUSH_DAILY_CAP: a non-negative integer. undefined when malformed. */
export function parseDailyCap(raw: string | undefined | null): number | undefined {
  if (raw == null) return undefined;
  const v = raw.trim();
  if (!/^\d{1,6}$/.test(v)) return undefined;
  return Number(v);
}

/**
 * Builds the effective policy from env with defaults for anything missing
 * or malformed. `env` is injectable for tests; defaults to Deno.env.
 */
export function policyFromEnv(
  env: { get(name: string): string | undefined } = Deno.env,
  warn: (msg: string) => void = (m) => console.warn(m),
): PushPolicy {
  const policy: PushPolicy = { ...DEFAULT_POLICY, quiet: { ...DEFAULT_POLICY.quiet! } };

  const rawCap = env.get("PUSH_DAILY_CAP");
  if (rawCap != null && rawCap.trim() !== "") {
    const cap = parseDailyCap(rawCap);
    if (cap === undefined) {
      warn(`[push-policy] unknown PUSH_DAILY_CAP="${rawCap}", using ${DAILY_PUSH_CAP}`);
    } else {
      policy.dailyCap = cap;
    }
  }

  const rawQuiet = env.get("PUSH_QUIET_HOURS");
  if (rawQuiet != null && rawQuiet.trim() !== "") {
    const quiet = parseQuietHours(rawQuiet);
    if (quiet === undefined) {
      warn(
        `[push-policy] unknown PUSH_QUIET_HOURS="${rawQuiet}", using ${QUIET_START_HOUR}-${QUIET_END_HOUR}`,
      );
    } else {
      policy.quiet = quiet;
    }
  }

  return policy;
}
