'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';

export type AddressFields = {
  address: string;
  city: string;
  state: string;
  zip: string;
};

function revalidate() {
  revalidatePath('/admin/address-review');
  revalidatePath('/admin');
}

/**
 * Accept Google's address: overwrite the venue's address fields and clear the
 * flag. Leaves address_review_resolved_at NULL so the venue stays in the
 * validation rotation (it now matches Google, so it won't re-flag).
 */
export async function acceptGoogleAddress(venueId: string, fields: AddressFields) {
  await assertAdmin();
  if (!venueId) throw new Error('Missing venue id');
  const address = fields.address?.trim() ?? '';
  const city = fields.city?.trim() ?? '';
  const state = fields.state?.trim() ?? '';
  const zip = fields.zip?.trim() ?? '';
  if (!address || !city || !state || !zip) {
    throw new Error('Address, city, state and zip are all required');
  }

  const supabase = getAdminClient();

  const { data: venue, error: fetchErr } = await supabase
    .from('venues')
    .select('id, needs_address_review')
    .eq('id', venueId)
    .single();
  if (fetchErr || !venue) throw new Error('Venue not found');
  if (!venue.needs_address_review) throw new Error('Venue is not currently flagged for review');

  const { error: updErr } = await supabase
    .from('venues')
    .update({ address, city, state, zip, needs_address_review: false })
    .eq('id', venueId);
  if (updErr) throw new Error(updErr.message);

  revalidate();
  return { ok: true };
}

/**
 * Dismiss the flag (our address is right; Google's place_id points elsewhere).
 * Stamps resolution state so the hourly cron will not re-flag this venue.
 */
export async function dismissAddressReview(venueId: string) {
  await assertAdmin();
  if (!venueId) throw new Error('Missing venue id');

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const resolvedBy = auth.user?.id ?? null;

  const supabase = getAdminClient();

  const { data: venue, error: fetchErr } = await supabase
    .from('venues')
    .select('id, needs_address_review')
    .eq('id', venueId)
    .single();
  if (fetchErr || !venue) throw new Error('Venue not found');
  if (!venue.needs_address_review) throw new Error('Venue is not currently flagged for review');

  const { error: updErr } = await supabase
    .from('venues')
    .update({
      needs_address_review: false,
      address_review_resolved_at: new Date().toISOString(),
      address_review_resolved_by: resolvedBy,
    })
    .eq('id', venueId);
  if (updErr) throw new Error(updErr.message);

  revalidate();
  return { ok: true };
}
