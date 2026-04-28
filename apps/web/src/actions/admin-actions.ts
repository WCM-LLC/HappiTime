'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';

export async function adminToggleWindow(windowId: string, currentStatus: string) {
  await assertAdmin();
  const supabase = getAdminClient();
  const next = currentStatus === 'published' ? 'draft' : 'published';
  const { error } = await supabase
    .from('happy_hour_windows')
    .update({ status: next })
    .eq('id', windowId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function adminToggleVenueStatus(venueId: string, currentStatus: string | null) {
  await assertAdmin();
  const supabase = getAdminClient();
  const next = currentStatus === 'published' ? 'draft' : 'published';
  const { error } = await supabase
    .from('venues')
    .update({ status: next })
    .eq('id', venueId);
  if (error) throw new Error(error.message);
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
  const { error } = await supabase
    .from('venues')
    .update({
      promotion_tier: tier,
      promotion_priority: priority ?? (tier === 'featured' ? 30 : tier === 'premium' ? 20 : tier === 'basic' ? 10 : 0),
    })
    .eq('id', venueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function adminSetPromotionPriority(venueId: string, priority: number) {
  await assertAdmin();
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('venues')
    .update({ promotion_priority: priority })
    .eq('id', venueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}
