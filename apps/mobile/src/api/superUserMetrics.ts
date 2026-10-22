// src/api/superUserMetrics.ts — the Tastemaker's own numbers, read through the
// same public.super_user_metrics(p_days) the console uses (computed on read,
// scoped to the caller). Plus the shareable stats card, fetched from the
// console route with the app's Supabase access token.
import { Platform, Share } from "react-native";
import { supabase } from "./supabaseClient";

export type MetricsRange = "7d" | "28d" | "90d" | "all";
export const RANGE_DAYS: Record<MetricsRange, number> = { "7d": 7, "28d": 28, "90d": 90, all: 0 };
export const RANGE_LABEL: Record<MetricsRange, string> = { "7d": "7d", "28d": "28d", "90d": "90d", all: "All" };

export type DailyPoint = { day: string; people_sent: number; guide_views: number; qr_scans: number; referrals: number };

export type SuperUserMetrics = {
  handle: string | null;
  range_days: number | null;
  window_start: string | null;
  window_end: string;
  tracking_since: string | null;
  influence: {
    people_sent: number; people_sent_prior: number | null; people_sent_all: number;
    new_faces: number; new_faces_prior: number | null;
    venues_moved: number; venues_moved_prior: number | null;
    redemptions: number; venues_touched: number;
    venues: { venue_id: string; name: string; neighborhood: string | null; people_sent: number; new_faces: number }[];
  };
  guides: {
    published_count: number; draft_count: number;
    views: number; views_prior: number | null; venue_clicks: number; venue_clicks_prior: number | null;
    people_sent: number; people_sent_prior: number | null;
    items: { guide_id: string; slug: string; title: string; status: string; views: number; venue_clicks: number; ctr: number | null; people_sent: number; daily: { day: string; views: number }[] }[];
  };
  referrals: { joined: number; joined_prior: number | null; joined_all: number; qr_scans: number; qr_scans_prior: number | null; qr_scans_all: number; first_checkins: number; itinerary_saves: number };
  daily: DailyPoint[];
  totals: { people_sent: number; new_faces: number; venues_moved: number; guide_views: number; referrals: number; qr_scans: number; guides_published: number };
};

export async function fetchSuperUserMetrics(range: MetricsRange): Promise<SuperUserMetrics> {
  const { data, error } = await (supabase as any).rpc("super_user_metrics", { p_days: RANGE_DAYS[range] });
  if (error) throw error;
  return data as SuperUserMetrics;
}

// ── Milestones: the next meaningful number, so the screen reads as progress
// rather than zeros. Same ladders as the console.
export type Milestone = { key: string; label: string; target: number; value: number; done: boolean };
const LADDERS: Record<string, number[]> = {
  people_sent: [10, 50, 100, 250, 500, 1000],
  guide_views: [100, 500, 1000, 5000, 10000, 25000],
  venues_moved: [1, 5, 10, 25, 50],
  referrals: [1, 5, 20, 50, 100],
};
export function milestonesFor(t: SuperUserMetrics["totals"]): Milestone[] {
  const specs: { key: keyof typeof LADDERS; value: number; label: (n: number) => string }[] = [
    { key: "people_sent", value: t.people_sent, label: (n) => `${n} people sent` },
    { key: "guide_views", value: t.guide_views, label: (n) => `${n.toLocaleString("en-US")} guide views` },
    { key: "venues_moved", value: t.venues_moved, label: (n) => `${n} venue${n === 1 ? "" : "s"} moved` },
    { key: "referrals", value: t.referrals, label: (n) => `${n} referral${n === 1 ? "" : "s"}` },
  ];
  const out: Milestone[] = [];
  for (const s of specs) {
    const ladder = LADDERS[s.key];
    const done = ladder.filter((x) => s.value >= x);
    const next = ladder.find((x) => s.value < x);
    if (done.length) out.push({ key: `${s.key}-${done[done.length - 1]}`, label: s.label(done[done.length - 1]), target: done[done.length - 1], value: s.value, done: true });
    if (next !== undefined) out.push({ key: `${s.key}-${next}`, label: s.label(next), target: next, value: s.value, done: false });
  }
  return out.sort((a, b) => Number(b.done) - Number(a.done) || b.value / b.target - a.value / a.target).slice(0, 4);
}

export function delta(current: number, prior: number | null | undefined): { text: string; up: boolean } | null {
  if (prior === null || prior === undefined) return null;
  const d = current - prior;
  if (d > 0) return { text: `+${d.toLocaleString("en-US")}`, up: true };
  if (d < 0) return { text: d.toLocaleString("en-US"), up: false };
  return { text: "same", up: false };
}

const CONSOLE_URL = "https://console.happitime.biz";

/**
 * Fetches the co-branded stats card from the console (which renders it from the
 * same metrics) and opens the system share sheet with it. iOS shares the PNG;
 * Android's Share API carries text only, so it shares the author link instead.
 */
export async function shareStatsCard(range: MetricsRange, handle: string | null): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to share your stats card.");

  const url = `${CONSOLE_URL}/api/metrics/card?range=${range}`;
  const authorUrl = handle ? `https://www.happitime.biz/author/${handle}` : "https://www.happitime.biz";

  if (Platform.OS !== "ios") {
    await Share.share({ message: `My HappiTime Tastemaker stats — ${authorUrl}` });
    return;
  }

  // Loaded lazily so a module-resolution problem can only fail this button,
  // never the app at boot (the June OTA outage was a boot-time failure).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
  const target = `${FileSystem.cacheDirectory}happitime-stats-${range}.png`;
  const res = await FileSystem.downloadAsync(url, target, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status !== 200) throw new Error("Couldn't build your stats card right now.");
  await Share.share({ url: res.uri });
}
