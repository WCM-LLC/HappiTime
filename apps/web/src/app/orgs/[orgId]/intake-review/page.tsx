/**
 * A venue owner's approval queue: menus a super user scanned for one of their
 * venues, waiting on someone from the org to bless them. Owners scanning their
 * own menus never land here — that publishes straight away.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { IntakeReviewActions } from '@/components/intake/IntakeReviewActions';
import {
  approveOrgIntakeSubmission,
  rejectOrgIntakeSubmission,
} from '@/actions/org-intake-review-actions';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { isOrgIntakeReviewer } from '@/utils/intake-access';
import { loginPathFor } from '@/utils/auth-paths';

type SubmissionRow = {
  id: string;
  venue_id: string;
  menu_id: string | null;
  submitted_by: string;
  content_type: string | null;
  created_at: string;
};

/** Human label for what this submission is asking the org to approve. */
function contentSummary(contentType: string | null, eventCount: number): string {
  if (contentType === 'event' || contentType === 'event_series') {
    return eventCount === 1 ? '1 event' : `${eventCount} events`;
  }
  if (contentType === 'mixed') {
    return eventCount === 1 ? 'Menu + 1 event' : `Menu + ${eventCount} events`;
  }
  return 'Happy hour menu';
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default async function OrgIntakeReviewPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginPathFor(`/orgs/${orgId}/intake-review`));
  if (!(await isOrgIntakeReviewer(supabase, auth.user.id, orgId))) redirect(`/orgs/${orgId}`);

  const keyError = getServiceRoleKeyError();
  const db = keyError ? supabase : createServiceClient();

  const [{ data: org }, { data: raw, error }] = await Promise.all([
    (db as any).from('organizations').select('name').eq('id', orgId).maybeSingle(),
    (db as any)
      .from('intake_submissions')
      .select('id, venue_id, menu_id, submitted_by, content_type, created_at')
      .eq('status', 'pending')
      .eq('review_route', 'owner')
      .eq('review_org_id', orgId)
      .order('created_at', { ascending: true })
      .limit(200),
  ]);
  const rows: SubmissionRow[] = (raw ?? []) as SubmissionRow[];

  // Approved but not yet live. Approving stopped publishing in #178, and the
  // contributor leaderboard counts published content only — so anything
  // sitting here is a contributor earning nothing while they wait on us.
  const { data: awaitingRows } = await (db as any)
    .from('intake_submissions')
    .select('id, menus!inner(status)')
    .eq('review_org_id', orgId)
    .eq('status', 'approved')
    .neq('menus.status', 'published');
  const awaitingPublish = ((awaitingRows ?? []) as Array<{ id: string }>).length;

  // What each submission actually contains, so nobody approves blind.
  const eventCountBySubmission = new Map<string, number>();
  if (rows.length > 0) {
    const { data: links } = await (db as any)
      .from('intake_submission_events')
      .select('submission_id')
      .in('submission_id', rows.map((r) => r.id));
    for (const l of ((links ?? []) as Array<{ submission_id: string }>)) {
      eventCountBySubmission.set(l.submission_id, (eventCountBySubmission.get(l.submission_id) ?? 0) + 1);
    }
  }

  const venueIds = [...new Set(rows.map((r) => r.venue_id))];
  const { data: venues } = venueIds.length
    ? await (db as any).from('venues').select('id, name').in('id', venueIds)
    : { data: [] };
  const venueById = new Map(
    ((venues ?? []) as Array<{ id: string; name: string }>).map((v) => [v.id, v]),
  );

  // Submitter emails need the admin API; skip the column entirely without it
  // rather than leaking raw user ids to an org.
  const emailBySubmitter = new Map<string, string>();
  if (!keyError) {
    const admin = createServiceClient();
    await Promise.all(
      [...new Set(rows.map((r) => r.submitted_by))].map(async (uid) => {
        const { data } = await admin.auth.admin.getUserById(uid);
        if (data?.user?.email) emailBySubmitter.set(uid, data.user.email);
      }),
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <UserBar />
      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">Dashboard</Link>
              <span className="text-muted-light">/</span>
              <Link href={`/orgs/${orgId}`} className="text-body-sm text-muted hover:text-foreground transition-colors">
                {(org as { name?: string } | null)?.name ?? 'Organization'}
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Menu approvals</h1>
            <p className="text-body-sm text-muted mt-1">
              Someone scanned a menu or an event for one of your venues. Approving saves a draft — nothing is public until you publish it from the venue page.
            </p>
          </div>
          <Link href={`/orgs/${orgId}`}>
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Back to organization
            </span>
          </Link>
        </div>

        {awaitingPublish > 0 ? (
          <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-foreground">
              {awaitingPublish} approved{' '}
              {awaitingPublish === 1 ? 'submission is' : 'submissions are'} still unpublished
            </p>
            <p className="text-body-sm text-muted mt-0.5">
              Approving saves a draft. Publish from the venue page to make it live — until
              then it is not visible to guests, and the contributor earns nothing for it.
            </p>
          </div>
        ) : null}

        {error && (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Failed to load approvals</p>
            <p className="text-body-sm text-error/80 mt-0.5">{error.message}</p>
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <span className="text-heading-sm font-semibold text-foreground">
            {rows.length} waiting on you
          </span>
        </div>

        {rows.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
            <p className="text-body-md font-semibold text-foreground mb-1">Nothing to approve</p>
            <p className="text-body-sm text-muted">
              Menus you scan yourself publish immediately — this queue is only for scans other people submit for your venues.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Venue</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Content</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Scanned by</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Submitted</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={`border-b border-border last:border-0 align-top ${i % 2 === 1 ? 'bg-background/50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link href={`/orgs/${orgId}/venues/${r.venue_id}`} className="text-brand hover:underline">
                        {venueById.get(r.venue_id)?.name ?? r.venue_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {contentSummary(r.content_type, eventCountBySubmission.get(r.id) ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-muted">{emailBySubmitter.get(r.submitted_by) ?? 'A HappiTime super user'}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <IntakeReviewActions
                        submissionId={r.id}
                        approve={approveOrgIntakeSubmission.bind(null, orgId)}
                        reject={rejectOrgIntakeSubmission.bind(null, orgId)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
