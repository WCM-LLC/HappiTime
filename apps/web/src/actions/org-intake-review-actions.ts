'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isOrgIntakeReviewer } from '@/utils/intake-access';
import { approveSubmission, loadPendingSubmission, rejectSubmission } from '@/utils/intake-review';
import type { PendingSubmission } from '@/utils/intake-review';

/**
 * A venue's own people approving a scan someone else made for them. The org
 * in the URL is never trusted on its own: the submission must actually be
 * routed to that org, and the caller must hold an intake role in it.
 */
async function authorize(
  orgId: string,
  submissionId: string,
): Promise<{ sub: PendingSubmission; userId: string }> {
  if (!orgId) throw new Error('Missing org id');
  if (!submissionId) throw new Error('Missing submission id');

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error('Not signed in');
  if (!(await isOrgIntakeReviewer(supabase, user.id, orgId))) {
    throw new Error('You do not have permission to review submissions for this organization');
  }

  const sub = await loadPendingSubmission(createServiceClient(), submissionId);
  if (sub.review_route !== 'owner' || sub.review_org_id !== orgId) {
    throw new Error('That submission is not in this organization’s queue');
  }
  return { sub, userId: user.id };
}

function revalidate(orgId: string) {
  revalidatePath(`/orgs/${orgId}/intake-review`);
  revalidatePath(`/orgs/${orgId}`);
}

export async function approveOrgIntakeSubmission(orgId: string, submissionId: string) {
  const { sub, userId } = await authorize(orgId, submissionId);
  await approveSubmission(sub, userId);
  revalidate(orgId);
  return { ok: true };
}

export async function rejectOrgIntakeSubmission(
  orgId: string,
  submissionId: string,
  reason?: string,
) {
  const { sub, userId } = await authorize(orgId, submissionId);
  await rejectSubmission(sub, userId, reason);
  revalidate(orgId);
  return { ok: true };
}
