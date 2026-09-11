'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';
import { syncBundleQuantity } from '@/utils/bundle-sync';

function revalidate() {
  revalidatePath('/admin/address-review');
  revalidatePath('/admin');
}

/**
 * Confirm a suspected closure: hard-delete the venue (delete-over-archive
 * policy; FK cascades remove windows/menus/media rows), then clean up the
 * org if this was its last venue. Human-triggered only — the validation
 * cron never deletes.
 */
export async function confirmVenueClosed(venueId: string) {
  await assertAdmin();
  if (!venueId) throw new Error('Missing venue id');

  const supabase = getAdminClient();

  const { data: venue, error: fetchErr } = await supabase
    .from('venues')
    .select('id, org_id, closure_suspected')
    .eq('id', venueId)
    .single();
  if (fetchErr || !venue) throw new Error('Venue not found');
  if (!venue.closure_suspected) throw new Error('Venue is not currently flagged as closed');

  const { error: delErr } = await supabase.from('venues').delete().eq('id', venueId);
  if (delErr) throw new Error(delErr.message);

  if (venue.org_id) {
    const { count } = await supabase
      .from('venues')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', venue.org_id);
    if ((count ?? 0) === 0) {
      // Orphan-org cleanup: an org whose only venue closed has nothing left
      // to manage; cascade removes members and invites.
      const { error: orgErr } = await supabase
        .from('organizations')
        .delete()
        .eq('id', venue.org_id);
      if (orgErr) console.error('[closure-review] orphan org cleanup failed:', orgErr.message);
    } else {
      // Venue count changed → keep any active org bundle in sync.
      await syncBundleQuantity(venue.org_id);
    }
  }

  revalidate();
  return { ok: true };
}

/**
 * Dismiss the closure flag (Google mislabeled the venue, or it reopened).
 * Stamps closure_review_resolved_at so the cron will not re-flag.
 */
export async function dismissClosureReview(venueId: string) {
  await assertAdmin();
  if (!venueId) throw new Error('Missing venue id');

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  void auth; // parity with dismissAddressReview; no resolved_by column for closures

  const supabase = getAdminClient();

  const { data: venue, error: fetchErr } = await supabase
    .from('venues')
    .select('id, closure_suspected')
    .eq('id', venueId)
    .single();
  if (fetchErr || !venue) throw new Error('Venue not found');
  if (!venue.closure_suspected) throw new Error('Venue is not currently flagged as closed');

  const { error: updErr } = await supabase
    .from('venues')
    .update({
      closure_suspected: false,
      closure_review_resolved_at: new Date().toISOString(),
    })
    .eq('id', venueId);
  if (updErr) throw new Error(updErr.message);

  revalidate();
  return { ok: true };
}
