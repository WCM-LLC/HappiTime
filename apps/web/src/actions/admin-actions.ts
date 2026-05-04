'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';

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

export type PromotionTier = 'basic' | 'premium' | 'featured' | null;

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
      promotion_priority: priority ?? (tier === 'featured' ? 30 : tier === 'premium' ? 20 : tier === 'basic' ? 10 : 0),
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
