'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { buildVenueSearchOr } from '@/lib/venueSearchOr.mjs';
import type { VenueRow } from '@/app/admin/AdminTables';

function assertAdminMutationRows(
  operation: string,
  rows: { id: string }[] | null | undefined,
  error: unknown,
) {
  if (error) {
    console.error(`[${operation}] write failed`, error);
    const message =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Admin write failed';
    throw new Error(message);
  }

  if (!rows || rows.length === 0) {
    console.warn(`[${operation}] zero rows affected`);
    throw new Error('No rows were updated.');
  }
}

/* ── Venue Search ── */

// Hard cap on rows returned per search. `total` still reports the full match
// count so the UI can tell the admin to refine rather than truncating silently.
const ADMIN_VENUE_SEARCH_LIMIT = 200;

export type AdminVenueSearchResult = { rows: VenueRow[]; total: number };

/**
 * Searches ALL venues (any age, any status) for the admin console. The
 * default /admin table only loads the 100 most recently created venues, so
 * this is the path that guarantees an admin can always find a venue.
 */
export async function adminSearchVenues(query: string): Promise<AdminVenueSearchResult> {
  await assertAdmin();
  const orFilter = buildVenueSearchOr(query);
  if (!orFilter) return { rows: [], total: 0 };

  const supabase = getAdminClient();
  const { data: venuesRaw, count, error } = await supabase
    .from('venues')
    .select('id, org_id, name, org_name, city, state, status, promotion_tier, promotion_priority, created_at', { count: 'exact' })
    .or(orFilter)
    .order('name', { ascending: true })
    .limit(ADMIN_VENUE_SEARCH_LIMIT);
  if (error) {
    console.error('[adminSearchVenues] query failed', error);
    throw new Error(error.message);
  }

  const venueIds = (venuesRaw ?? []).map((v) => v.id);
  const [{ data: mediaCounts }, { data: hhCounts }] = await Promise.all([
    venueIds.length > 0
      ? supabase.from('venue_media').select('venue_id').eq('status', 'published').in('venue_id', venueIds)
      : Promise.resolve({ data: [] as { venue_id: string }[] }),
    venueIds.length > 0
      ? supabase.from('happy_hour_windows').select('venue_id').eq('status', 'published').in('venue_id', venueIds)
      : Promise.resolve({ data: [] as { venue_id: string }[] }),
  ]);

  const medByVenue = (mediaCounts ?? []).reduce<Record<string, number>>((a, r) => {
    a[r.venue_id] = (a[r.venue_id] ?? 0) + 1;
    return a;
  }, {});
  const hhByVenue = (hhCounts ?? []).reduce<Record<string, number>>((a, r) => {
    a[r.venue_id] = (a[r.venue_id] ?? 0) + 1;
    return a;
  }, {});

  const rows: VenueRow[] = (venuesRaw ?? []).map((v) => ({
    id: v.id,
    org_id: v.org_id,
    org_name: v.org_name ?? '',
    name: v.name,
    city: v.city,
    state: v.state,
    status: v.status,
    promotion_tier: v.promotion_tier ?? null,
    promotion_priority: v.promotion_priority ?? 0,
    media_count: medByVenue[v.id] ?? 0,
    hh_count: hhByVenue[v.id] ?? 0,
    created_at: v.created_at,
  }));

  return { rows, total: count ?? rows.length };
}

export async function adminToggleWindow(windowId: string, currentStatus: string) {
  await assertAdmin();
  const supabase = getAdminClient();
  const next = currentStatus === 'published' ? 'draft' : 'published';
  const { data: updated, error } = await supabase
    .from('happy_hour_windows')
    .update({ status: next })
    .eq('id', windowId)
    .select('id, venue_id');
  assertAdminMutationRows('adminToggleWindow', updated, error);

  if (next === 'published') {
    const venueId = updated?.[0]?.venue_id;
    if (!venueId) throw new Error('No venue found for window.');
    const { data: venueRows, error: venueError } = await supabase
      .from('venues')
      .update({ status: 'published' })
      .eq('id', venueId)
      .select('id');
    assertAdminMutationRows('adminToggleWindow:publishVenue', venueRows, venueError);
  }

  revalidatePath('/admin');
}

export async function adminToggleVenueStatus(venueId: string, currentStatus: string | null) {
  await assertAdmin();
  const supabase = getAdminClient();
  const next = currentStatus === 'published' ? 'draft' : 'published';
  const { data: updated, error } = await supabase
    .from('venues')
    .update({ status: next })
    .eq('id', venueId)
    .select('id');
  assertAdminMutationRows('adminToggleVenueStatus', updated, error);
  revalidatePath('/admin');
}

/* ── Venue Promotion Actions ── */

// Mirrors the venues.promotion_tier CHECK (verified/featured/founding_pilot/bundle_*) or null.
export type PromotionTier =
  | 'verified'
  | 'featured'
  | 'founding_pilot'
  | 'bundle_2_4'
  | 'bundle_5_plus'
  | null;

export async function adminSetPromotionTier(
  venueId: string,
  tier: PromotionTier,
  priority?: number
) {
  await assertAdmin();
  const supabase = getAdminClient();
  const { data: updated, error } = await supabase
    .from('venues')
    .update({
      promotion_tier: tier,
      promotion_priority: priority ?? (tier === 'featured' ? 30 : tier === 'founding_pilot' ? 25 : tier === 'verified' ? 10 : 0),
    })
    .eq('id', venueId)
    .select('id');
  assertAdminMutationRows('adminSetPromotionTier', updated, error);
  revalidatePath('/admin');
}

export async function adminSetPromotionPriority(venueId: string, priority: number) {
  await assertAdmin();
  const supabase = getAdminClient();
  const { data: updated, error } = await supabase
    .from('venues')
    .update({ promotion_priority: priority })
    .eq('id', venueId)
    .select('id');
  assertAdminMutationRows('adminSetPromotionPriority', updated, error);
  revalidatePath('/admin');
}
