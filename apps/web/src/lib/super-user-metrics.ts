// Typed read of public.super_user_metrics(p_days) — the single server-side
// computation behind the Super User Home and /dashboard/metrics. Everything is
// computed on read; see supabase/migrations/20261022182448_super_user_metrics.sql.
import type { SupabaseClient } from '@supabase/supabase-js';

export type MetricsRange = '7d' | '28d' | '90d' | 'all';
export const RANGE_DAYS: Record<MetricsRange, number> = { '7d': 7, '28d': 28, '90d': 90, all: 0 };
export const RANGE_LABEL: Record<MetricsRange, string> = { '7d': '7 days', '28d': '28 days', '90d': '90 days', all: 'All time' };

export function parseRange(value: string | string[] | undefined): MetricsRange {
  const v = Array.isArray(value) ? value[0] : value;
  return v === '7d' || v === '90d' || v === 'all' ? v : '28d';
}

export type DailyPoint = {
  day: string;
  people_sent: number;
  guide_views: number;
  qr_scans: number;
  referrals: number;
};

export type VenueInfluence = {
  venue_id: string;
  name: string;
  slug: string | null;
  neighborhood: string | null;
  people_sent: number;
  new_faces: number;
  last_checkin_at: string | null;
};

export type GuideMetrics = {
  guide_id: string;
  slug: string;
  title: string;
  status: string;
  cover_image_url: string | null;
  published_at: string | null;
  updated_at: string | null;
  views: number;
  views_prior: number | null;
  views_all: number;
  sessions: number;
  venue_clicks: number;
  venue_clicks_prior: number | null;
  ctr: number | null;
  people_sent: number;
  people_sent_prior: number | null;
  people_sent_all: number;
  first_tracked_at: string | null;
  daily: { day: string; views: number }[];
  venues: { venue_id: string; name: string; people_sent: number }[];
};

export type SuperUserMetrics = {
  super_user_id: string;
  handle: string | null;
  range_days: number | null;
  window_start: string | null;
  window_end: string;
  tracking_since: string | null;
  influence: {
    people_sent: number;
    people_sent_prior: number | null;
    people_sent_all: number;
    new_faces: number;
    new_faces_prior: number | null;
    venues_moved: number;
    venues_moved_prior: number | null;
    venues_moved_all: number;
    redemptions: number;
    redemptions_prior: number | null;
    venues_touched: number;
    venues: VenueInfluence[];
  };
  guides: {
    published_count: number;
    draft_count: number;
    views: number;
    views_prior: number | null;
    views_all: number;
    venue_clicks: number;
    venue_clicks_prior: number | null;
    people_sent: number;
    people_sent_prior: number | null;
    items: GuideMetrics[];
  };
  referrals: {
    joined: number;
    joined_prior: number | null;
    joined_all: number;
    qr_scans: number;
    qr_scans_prior: number | null;
    qr_scans_all: number;
    first_checkins: number;
    first_checkins_all: number;
    itinerary_saves: number;
    itinerary_saves_all: number;
    weekly: { week_start: string; scans: number; joined: number }[];
  };
  daily: DailyPoint[];
  totals: {
    people_sent: number;
    new_faces: number;
    venues_moved: number;
    guide_views: number;
    referrals: number;
    qr_scans: number;
    guides_published: number;
    first_people_sent_at: string | null;
    first_guide_published_at: string | null;
  };
};

export async function getSuperUserMetrics(
  supabase: SupabaseClient,
  range: MetricsRange = '28d',
  superUserId?: string,
): Promise<{ data: SuperUserMetrics | null; error: string | null }> {
  const { data, error } = await supabase.rpc('super_user_metrics', {
    p_days: RANGE_DAYS[range],
    ...(superUserId ? { p_super_user_id: superUserId } : {}),
  });
  if (error) return { data: null, error: error.message };
  return { data: (data ?? null) as SuperUserMetrics | null, error: null };
}

// ── Milestones: progress toward the next meaningful number. This is what makes
// the page good at zero — a target with a bar, not an empty chart.
export type Milestone = { key: string; label: string; target: number; value: number; done: boolean };

const LADDERS: Record<string, number[]> = {
  people_sent: [10, 50, 100, 250, 500, 1000],
  guide_views: [100, 500, 1000, 5000, 10000, 25000],
  venues_moved: [1, 5, 10, 25, 50],
  referrals: [1, 5, 20, 50, 100],
};

function next(ladder: number[], value: number) {
  const done = ladder.filter((t) => value >= t);
  const upcoming = ladder.find((t) => value < t) ?? null;
  return { lastDone: done.length ? done[done.length - 1] : null, upcoming };
}

export function milestonesFor(t: SuperUserMetrics['totals']): Milestone[] {
  const out: Milestone[] = [];
  const specs: { key: keyof typeof LADDERS; value: number; label: (n: number) => string }[] = [
    { key: 'people_sent', value: t.people_sent, label: (n) => `${n} people sent` },
    { key: 'guide_views', value: t.guide_views, label: (n) => `${n.toLocaleString('en-US')} guide views` },
    { key: 'venues_moved', value: t.venues_moved, label: (n) => `${n} venue${n === 1 ? '' : 's'} moved` },
    { key: 'referrals', value: t.referrals, label: (n) => `${n} referral${n === 1 ? '' : 's'}` },
  ];
  for (const s of specs) {
    const { lastDone, upcoming } = next(LADDERS[s.key], s.value);
    if (lastDone !== null) out.push({ key: `${s.key}-${lastDone}`, label: s.label(lastDone), target: lastDone, value: s.value, done: true });
    if (upcoming !== null) out.push({ key: `${s.key}-${upcoming}`, label: s.label(upcoming), target: upcoming, value: s.value, done: false });
  }
  // Done first (most recent achievements), then the nearest-to-complete targets.
  return out
    .sort((a, b) => Number(b.done) - Number(a.done) || b.value / b.target - a.value / a.target)
    .slice(0, 4);
}
