'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';
import { approveSubmission, loadPendingSubmission, rejectSubmission } from '@/utils/intake-review';

function revalidate() {
  revalidatePath('/admin/intake-review');
  revalidatePath('/admin');
}

async function reviewerId(): Promise<string | null> {
  const authClient = await createClient();
  const { data } = await authClient.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Staff approval. Admins can act on any pending submission — including one
 * routed to an org that has gone quiet — so this deliberately does not filter
 * on review_route.
 */
export async function approveIntakeSubmission(submissionId: string) {
  await assertAdmin();
  if (!submissionId) throw new Error('Missing submission id');
  const sub = await loadPendingSubmission(getAdminClient(), submissionId);
  await approveSubmission(sub, await reviewerId());
  revalidate();
  return { ok: true };
}

export async function rejectIntakeSubmission(submissionId: string, reason?: string) {
  await assertAdmin();
  if (!submissionId) throw new Error('Missing submission id');
  const sub = await loadPendingSubmission(getAdminClient(), submissionId);
  await rejectSubmission(sub, await reviewerId(), reason);
  revalidate();
  return { ok: true };
}
