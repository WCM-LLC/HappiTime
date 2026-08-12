'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';
import { sendIntakeDecisionEmail } from '@/utils/email';

function revalidate() {
  revalidatePath('/admin/intake-review');
  revalidatePath('/admin');
}

async function loadPendingSubmission(supabase: ReturnType<typeof getAdminClient>, id: string) {
  const { data: sub, error } = await supabase
    .from('intake_submissions')
    .select('id, venue_id, menu_id, submitted_by, status')
    .eq('id', id)
    .single();
  if (error || !sub) throw new Error('Submission not found');
  if (sub.status !== 'pending') throw new Error('Submission was already reviewed');
  return sub;
}

async function notifySubmitter(
  supabase: ReturnType<typeof getAdminClient>,
  submittedBy: string,
  venueId: string,
  approved: boolean,
  rejectReason?: string | null,
) {
  const [{ data: authUser }, { data: venue }] = await Promise.all([
    supabase.auth.admin.getUserById(submittedBy),
    supabase.from('venues').select('name').eq('id', venueId).maybeSingle(),
  ]);
  const to = authUser?.user?.email;
  if (!to) return;
  await sendIntakeDecisionEmail({
    to,
    venueName: venue?.name ?? 'your venue',
    approved,
    rejectReason,
  });
}

/**
 * Approve: publish the drafted menu AND any draft windows the same commit
 * created (the /api/intake/claim path only flips the menu — draft windows
 * stayed invisible; this flow flips both).
 */
export async function approveIntakeSubmission(submissionId: string) {
  await assertAdmin();
  if (!submissionId) throw new Error('Missing submission id');
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();

  const supabase = getAdminClient();
  const sub = await loadPendingSubmission(supabase, submissionId);
  if (!sub.menu_id) throw new Error('Submission has no menu (it may have been deleted)');

  const { error: menuErr } = await supabase
    .from('menus')
    .update({ status: 'published', is_active: true })
    .eq('id', sub.menu_id)
    .eq('venue_id', sub.venue_id);
  if (menuErr) throw new Error(menuErr.message);

  const { data: joins } = await supabase
    .from('happy_hour_window_menus')
    .select('happy_hour_window_id')
    .eq('menu_id', sub.menu_id);
  const windowIds = (joins ?? []).map((j) => j.happy_hour_window_id);
  if (windowIds.length > 0) {
    const { error: winErr } = await supabase
      .from('happy_hour_windows')
      .update({ status: 'published', last_confirmed_at: new Date().toISOString() })
      .in('id', windowIds)
      .eq('status', 'draft');
    if (winErr) throw new Error(winErr.message);
  }

  const { error: subErr } = await supabase
    .from('intake_submissions')
    .update({
      status: 'approved',
      reviewed_by: auth.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (subErr) throw new Error(subErr.message);

  await notifySubmitter(supabase, sub.submitted_by, sub.venue_id, true);
  revalidate();
  return { ok: true };
}

/** Reject: menu stays draft; submitter gets the reason by email. */
export async function rejectIntakeSubmission(submissionId: string, reason?: string) {
  await assertAdmin();
  if (!submissionId) throw new Error('Missing submission id');
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();

  const supabase = getAdminClient();
  const sub = await loadPendingSubmission(supabase, submissionId);

  const { error: subErr } = await supabase
    .from('intake_submissions')
    .update({
      status: 'rejected',
      reject_reason: reason?.trim() || null,
      reviewed_by: auth.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  if (subErr) throw new Error(subErr.message);

  await notifySubmitter(supabase, sub.submitted_by, sub.venue_id, false, reason);
  revalidate();
  return { ok: true };
}
