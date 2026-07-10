'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { REWARD_PRESET_KEYS } from '@happitime/shared-types';

/**
 * Save a venue's redeemable-reward config (preset + advertise toggle).
 * Presets only — a value not in the canonical key list is stored as null.
 * RLS: the venue-update policy already restricts writes to the venue's org members.
 */
export async function saveVenueReward(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const orgId = String(formData.get('org_id') ?? '');
  const venueId = String(formData.get('venue_id') ?? '');
  const rawPreset = String(formData.get('reward_preset') ?? '');
  const active = formData.get('reward_active') === 'on';
  const returnPath = `/orgs/${orgId}/venues/${venueId}`;

  const reward_preset = REWARD_PRESET_KEYS.includes(rawPreset) ? rawPreset : null;

  const { error } = await supabase
    .from('venues')
    .update({ reward_preset, reward_active: active } as never)
    .eq('id', venueId);

  if (error) redirect(`${returnPath}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(returnPath);
  redirect(`${returnPath}?success=reward_saved`);
}
