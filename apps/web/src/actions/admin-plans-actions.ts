'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';

export async function adminUpsertVenueSubscription(formData: FormData) {
  await assertAdmin();
  const venueId = formData.get('venue_id') as string | null;
  const plan    = formData.get('plan')     as string | null;
  const status  = formData.get('status')   as string | null;
  if (!venueId || !plan || !status) throw new Error('venue_id, plan, and status are required');
  const supabase = getAdminClient();
  const { error } = await (supabase as any)
    .from('venue_subscriptions')
    .upsert({ venue_id: venueId, plan, status }, { onConflict: 'venue_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}

export async function adminUpsertUserPlan(formData: FormData) {
  await assertAdmin();
  const userId = formData.get('user_id') as string | null;
  const plan   = formData.get('plan')    as string | null;
  const status = formData.get('status')  as string | null;
  if (!userId || !plan || !status) throw new Error('user_id, plan, and status are required');
  const supabase = getAdminClient();
  const { error } = await (supabase as any)
    .from('user_plans')
    .upsert({ user_id: userId, plan, status }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}

export async function adminDeleteVenueSubscription(formData: FormData) {
  await assertAdmin();
  const venueId = formData.get('venue_id') as string | null;
  if (!venueId) throw new Error('venue_id is required');
  const supabase = getAdminClient();
  const { error } = await (supabase as any)
    .from('venue_subscriptions')
    .delete()
    .eq('venue_id', venueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}

export async function adminDeleteUserPlan(formData: FormData) {
  await assertAdmin();
  const userId = formData.get('user_id') as string | null;
  if (!userId) throw new Error('user_id is required');
  const supabase = getAdminClient();
  const { error } = await (supabase as any)
    .from('user_plans')
    .delete()
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/plans');
}
