import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { IntakeReviewActions } from '@/components/intake/IntakeReviewActions';
import { approveIntakeSubmission, rejectIntakeSubmission } from '@/actions/admin-intake-review-actions';

type SubmissionRow = {
  id: string;
  venue_id: string;
  menu_id: string | null;
  submitted_by: string;
  tier: string;
  content_type: string | null;
  created_at: string;
};

/** Human label for what a submission is asking a reviewer to approve. */
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

export default async function IntakeReviewPage() {
  const keyError = getServiceRoleKeyError();
  const supabase = keyError ? await createClient() : createServiceClient();

  const { data: raw, error } = await (supabase as any)
    .from('intake_submissions')
    .select('id, venue_id, menu_id, submitted_by, tier, content_type, created_at')
    .eq('status', 'pending')
    // Owner-routed submissions belong to the venue's own org queue; staff only
    // see the ones nobody else can act on (ownerless venues, empty orgs).
    .eq('review_route', 'admin')
    .order('created_at', { ascending: true })
    .limit(200);
  const rows: SubmissionRow[] = (raw ?? []) as SubmissionRow[];

  // Resolve venue names + submitter emails for display.
  const venueIds = [...new Set(rows.map((r) => r.venue_id))];
  const { data: venues } = venueIds.length
    ? await (supabase as any).from('venues').select('id, name, org_id').in('id', venueIds)
    : { data: [] };
  const venueById = new Map(
    ((venues ?? []) as Array<{ id: string; name: string; org_id: string | null }>).map((v) => [v.id, v]),
  );

  // Linked events per submission — a reviewer must know whether "Approve &
  // publish" publishes a menu or three events before they click it.
  const eventCountBySubmission = new Map<string, number>();
  if (rows.length > 0) {
    const { data: links } = await (supabase as any)
      .from('intake_submission_events')
      .select('submission_id')
      .in('submission_id', rows.map((r) => r.id));
    for (const l of ((links ?? []) as Array<{ submission_id: string }>)) {
      eventCountBySubmission.set(l.submission_id, (eventCountBySubmission.get(l.submission_id) ?? 0) + 1);
    }
  }

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
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">Dashboard</Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">Admin Console</Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Intake Review</h1>
            <p className="text-body-sm text-muted mt-1">
              Super-user scans of venues with nobody to approve them. Venues that belong to an org
              are reviewed by that org. Approve to publish what the Content column names; reject with a reason.
            </p>
          </div>
          <Link href="/admin">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Admin Console
            </span>
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Failed to load review queue</p>
            <p className="text-body-sm text-error/80 mt-0.5">{error.message}</p>
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <span className="text-heading-sm font-semibold text-foreground">
            {rows.length} submission{rows.length !== 1 ? 's' : ''} pending
          </span>
        </div>

        {rows.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
            <p className="text-body-md font-semibold text-foreground mb-1">Nothing to review</p>
            <p className="text-body-sm text-muted">
              When a super user scans a menu or an event flyer for a venue with no org behind it, it lands here.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Venue</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Submitted by</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Content</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Tier</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Submitted</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const venue = venueById.get(r.venue_id);
                  return (
                    <tr key={r.id} className={`border-b border-border last:border-0 align-top ${i % 2 === 1 ? 'bg-background/50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {venue?.org_id ? (
                          <Link href={`/orgs/${venue.org_id}/venues/${r.venue_id}?from=admin`} className="text-brand hover:underline">
                            {venue?.name ?? r.venue_id}
                          </Link>
                        ) : (
                          venue?.name ?? r.venue_id
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{emailBySubmitter.get(r.submitted_by) ?? r.submitted_by.slice(0, 8)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {contentSummary(r.content_type, eventCountBySubmission.get(r.id) ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-brand-subtle text-brand-dark-alt">
                          {r.tier === 'super_user' ? 'Super user' : 'Owner'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <IntakeReviewActions
                          submissionId={r.id}
                          approve={approveIntakeSubmission}
                          reject={rejectIntakeSubmission}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
