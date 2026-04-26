'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';

// Default promotion priorities by tier. Higher = displayed first in listings.
const PROMOTION_PRIORITY: Record<string, number> = {
  featured: 30,
  premium: 20,
  basic: 10,
};

/** Toggles a happy hour window between 'draft' and 'published'. Requires admin. */
export async function adminToggleWindow(windowId: string, currentStatus: string) {
  await assertAdmin();
  const supabase = getAdminClient();
  const next = currentStatus === 'published' ? 'draft' : 'published';
  const { error } = await supabase.from('happy_hour_windows').update({ status: next }).eq('id', windowId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

/** Toggles a venue between 'draft' and 'published'. Requires admin. */
export async function adminToggleVenueStatus(venueId: string, currentStatus: string | null) {
  await assertAdmin();
  const supabase = getAdminClient();
  const next = currentStatus === 'published' ? 'draft' : 'published';
  const { error } = await supabase.from('venues').update({ status: next }).eq('id', venueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export type PromotionTier = 'basic' | 'premium' | 'featured' | null;

/**
 * Sets a venue's promotion tier and priority. Requires admin.
 * If no priority is provided, uses the default for the tier (featured=30, premium=20, basic=10, null=0).
 */
export async function adminSetPromotionTier(venueId: string, tier: PromotionTier, priority?: number) {
  await assertAdmin();
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('venues')
    .update({
      promotion_tier: tier,
      promotion_priority: priority ?? (tier ? (PROMOTION_PRIORITY[tier] ?? 0) : 0),
    })
    .eq('id', venueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

/** Overrides the promotion sort priority for a venue without changing its tier. Requires admin. */
export async function adminSetPromotionPriority(venueId: string, priority: number) {
  await assertAdmin();
  const supabase = getAdminClient();
  const { error } = await supabase.from('venues').update({ promotion_priority: priority }).eq('id', venueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}
