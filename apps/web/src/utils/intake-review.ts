/**
 * Shared core for acting on an intake submission, used by both review queues:
 * HappiTime staff at /admin/intake-review and a venue's own org at
 * /orgs/[orgId]/intake-review. Authorization is deliberately NOT handled here
 * — each caller proves the reviewer may act, then calls in. Everything below
 * runs with the service-role client.
 */
import { createServiceClient } from '@/utils/supabase/server';
import { sendIntakeDecisionEmail } from '@/utils/email';

type AdminClient = ReturnType<typeof createServiceClient>;

export type PendingSubmission = {
  id: string;
  venue_id: string;
  /** Null for an events-only submission. */
  menu_id: string | null;
  content_type?: 'happy_hour' | 'event' | 'event_series' | 'mixed';
  submitted_by: string;
  review_route: 'owner' | 'admin';
  review_org_id: string | null;
  status: string;
};

/** Loads a submission that is still awaiting a decision, or throws. */
export async function loadPendingSubmission(
  db: AdminClient,
  id: string,
): Promise<PendingSubmission> {
  const { data, error } = await (db as any)
    .from('intake_submissions')
    .select('id, venue_id, menu_id, content_type, submitted_by, review_route, review_org_id, status')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Submission not found');
  const sub = data as PendingSubmission;
  if (sub.status !== 'pending') throw new Error('Submission was already reviewed');
  return sub;
}

/** Stamps the decision on the submission row. */
async function markReviewed(
  db: AdminClient,
  sub: PendingSubmission,
  reviewerId: string | null,
  status: 'approved' | 'rejected',
  rejectReason?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  };
  if (status === 'rejected') patch.reject_reason = rejectReason?.trim() || null;
  const { error } = await (db as any).from('intake_submissions').update(patch).eq('id', sub.id);
  if (error) throw new Error(error.message);
}

/** Best-effort note to the person who scanned the menu. Never throws. */
async function notifySubmitter(
  db: AdminClient,
  submittedBy: string,
  venueId: string,
  approved: boolean,
  rejectReason?: string | null,
): Promise<void> {
  try {
    const [{ data: authUser }, { data: venue }] = await Promise.all([
      db.auth.admin.getUserById(submittedBy),
      db.from('venues').select('name').eq('id', venueId).maybeSingle(),
    ]);
    const to = authUser?.user?.email;
    if (!to) return;
    await sendIntakeDecisionEmail({
      to,
      venueName: (venue as { name?: string } | null)?.name ?? 'your venue',
      approved,
      rejectReason,
    });
  } catch (err) {
    console.error('[intake-review] submitter notification failed:', err);
  }
}

/**
 * Approve: publish the drafted menu AND any draft windows the same commit
 * created. The older /api/intake/claim path only flips the menu, which leaves
 * draft windows invisible — this flow flips both.
 */
export async function approveSubmission(
  sub: PendingSubmission,
  reviewerId: string | null,
): Promise<void> {
  const db = createServiceClient();

  // Events first: a submission can be events-only, in which case there is no
  // menu to publish and requiring one would make it unapprovable.
  const { data: links } = await (db as any)
    .from('intake_submission_events')
    .select('event_id')
    .eq('submission_id', sub.id);
  const eventIds = ((links ?? []) as Array<{ event_id: string }>).map((l) => l.event_id);
  if (eventIds.length > 0) {
    const { error: evErr } = await db
      .from('venue_events')
      .update({ status: 'published' })
      .in('id', eventIds)
      .eq('status', 'draft');
    if (evErr) throw new Error(evErr.message);
  }

  if (!sub.menu_id) {
    if (eventIds.length === 0) {
      throw new Error('Submission has nothing to publish (it may have been deleted)');
    }
    await markReviewed(db, sub, reviewerId, 'approved');
    await notifySubmitter(db, sub.submitted_by, sub.venue_id, true);
    return;
  }

  const { error: menuErr } = await db
    .from('menus')
    .update({ status: 'published', is_active: true })
    .eq('id', sub.menu_id)
    .eq('venue_id', sub.venue_id);
  if (menuErr) throw new Error(menuErr.message);

  const { data: joins } = await db
    .from('happy_hour_window_menus')
    .select('happy_hour_window_id')
    .eq('menu_id', sub.menu_id);
  const windowIds = ((joins ?? []) as Array<{ happy_hour_window_id: string }>).map(
    (j) => j.happy_hour_window_id,
  );
  if (windowIds.length > 0) {
    const { error: winErr } = await db
      .from('happy_hour_windows')
      .update({ status: 'published', last_confirmed_at: new Date().toISOString() })
      .in('id', windowIds)
      .eq('status', 'draft');
    if (winErr) throw new Error(winErr.message);
  }

  const { error: subErr } = await (db as any)
    .from('intake_submissions')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', sub.id);
  if (subErr) throw new Error(subErr.message);

  await notifySubmitter(db, sub.submitted_by, sub.venue_id, true);
}

/** Reject: the menu stays a draft; the submitter gets the reason by email. */
export async function rejectSubmission(
  sub: PendingSubmission,
  reviewerId: string | null,
  reason?: string,
): Promise<void> {
  const db = createServiceClient();
  const { error } = await (db as any)
    .from('intake_submissions')
    .update({
      status: 'rejected',
      reject_reason: reason?.trim() || null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', sub.id);
  if (error) throw new Error(error.message);

  await notifySubmitter(db, sub.submitted_by, sub.venue_id, false, reason);
}
