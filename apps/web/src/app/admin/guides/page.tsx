import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createServiceClient } from '@/utils/supabase/server';
import {
  GuideAuditTable,
  GuidesReviewTable,
  type GuideAuditRow,
  type GuideReviewRow,
} from './AdminGuidesTable';

const NOTICE: Record<string, string> = {
  guide_approved: 'Guide approved and published.',
  guide_rejected: 'Guide returned to draft.',
  guide_unpublished: 'Guide unpublished.',
};

const ERRORS: Record<string, string> = {
  missing_guide_id: 'No guide was selected.',
  guide_not_found: 'Guide not found.',
  approve_failed: 'Approval failed — try again.',
  reject_failed: 'Rejection failed — try again.',
  unpublish_failed: 'Unpublish failed — try again.',
  invalid_status: 'That guide is no longer in the required status for this action.',
  cover_upload_failed: 'Cover image upload failed — try again.',
};

const TAB_LABELS: Record<string, string> = {
  pending: 'Pending review',
  published: 'Published',
  archived: 'Archived',
  audit: 'Audit log',
};

const STATUS_BY_TAB: Record<string, string> = {
  pending: 'pending_review',
  published: 'published',
  archived: 'archived',
};

async function authEmailMap(db: ReturnType<typeof createServiceClient>, userIds: string[]) {
  const emails = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(userIds.filter(Boolean))).map(async (userId) => {
      const { data } = await (db as any).auth.admin.getUserById(userId);
      if (data?.user?.email) emails.set(userId, data.user.email);
    }),
  );
  return emails;
}

export default async function AdminGuidesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; notice?: string; error?: string; author?: string; id?: string }>;
}) {
  const sp = await searchParams;
  if (sp.id) redirect(`/admin/guides/${sp.id}/preview`);

  const tab = sp.tab && TAB_LABELS[sp.tab] ? sp.tab : 'pending';
  const authorFilter = sp.author?.trim() || null;
  const noticeText = sp.notice ? (NOTICE[sp.notice] ?? null) : null;
  const errorText = sp.error ? (ERRORS[sp.error] ?? sp.error) : null;

  const db = createServiceClient();

  const [
    { count: pendingCount },
    { count: publishedCount },
    { count: archivedCount },
    { count: auditCount },
  ] = await Promise.all([
    db.from('guides').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    db.from('guides').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    db.from('guides').select('id', { count: 'exact', head: true }).eq('status', 'archived'),
    db.from('guide_submissions').select('id', { count: 'exact', head: true }),
  ]);

  const tabCounts: Record<string, number> = {
    pending: pendingCount ?? 0,
    published: publishedCount ?? 0,
    archived: archivedCount ?? 0,
    audit: auditCount ?? 0,
  };

  let authorFilterLabel: string | null = null;
  if (authorFilter) {
    const { data: profile } = await db
      .from('user_profiles')
      .select('handle, display_name')
      .eq('user_id', authorFilter)
      .maybeSingle();
    const p = profile as any;
    authorFilterLabel = p?.handle ? `@${p.handle}` : p?.display_name ?? authorFilter;
  }

  let reviewRows: GuideReviewRow[] = [];
  let auditRows: GuideAuditRow[] = [];

  if (tab === 'audit') {
    let submissionQuery = db
      .from('guide_submissions')
      .select('id, guide_id, submitted_by, submitted_at, reviewed_by, reviewed_at, decision, notes')
      .order('submitted_at', { ascending: false })
      .limit(200);

    if (authorFilter) {
      const { data: authorGuides } = await db
        .from('guides')
        .select('id')
        .eq('author_id', authorFilter);
      const authorGuideIds = (authorGuides ?? []).map((guide: any) => guide.id);
      submissionQuery = authorGuideIds.length > 0
        ? submissionQuery.in('guide_id', authorGuideIds)
        : submissionQuery.eq('guide_id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: submissionsRaw } = await submissionQuery;
    const submissions = (submissionsRaw ?? []) as any[];
    const guideIds = Array.from(new Set(submissions.map((row) => row.guide_id).filter(Boolean)));

    const { data: guidesRaw } = guideIds.length > 0
      ? await db
          .from('guides')
          .select('id, title, slug, status, author_id')
          .in('id', guideIds)
      : { data: [] as any[] };
    const guides = (guidesRaw ?? []) as any[];
    const guideById = new Map(guides.map((guide) => [guide.id, guide]));

    const authorIds = Array.from(new Set(guides.map((guide) => guide.author_id).filter(Boolean)));
    const { data: profilesRaw } = authorIds.length > 0
      ? await db
          .from('user_profiles')
          .select('user_id, handle, display_name')
          .in('user_id', authorIds)
      : { data: [] as any[] };
    const profileByUserId = new Map((profilesRaw ?? []).map((profile: any) => [profile.user_id, profile]));
    const reviewerEmails = await authEmailMap(
      db,
      submissions.map((row) => row.reviewed_by).filter(Boolean),
    );

    auditRows = submissions.map((row) => {
      const guide = guideById.get(row.guide_id) as any;
      const profile = guide?.author_id ? profileByUserId.get(guide.author_id) as any : null;
      return {
        id: row.id,
        guide_id: row.guide_id,
        guide_title: guide?.title ?? 'Deleted guide',
        guide_slug: guide?.slug ?? null,
        guide_status: guide?.status ?? null,
        author_handle: profile?.handle ?? null,
        author_display_name: profile?.display_name ?? null,
        decision: row.decision ?? null,
        notes: row.notes ?? null,
        submitted_at: row.submitted_at,
        reviewed_at: row.reviewed_at ?? null,
        reviewer_email: row.reviewed_by ? reviewerEmails.get(row.reviewed_by) ?? null : null,
      };
    });
  } else {
    const status = STATUS_BY_TAB[tab] ?? 'pending_review';
    let guideQuery = (db as any)
      .from('guides')
      .select('id, title, slug, status, city, neighborhood, tags, author_id, published_at, updated_at')
      .eq('status', status)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (authorFilter) guideQuery = guideQuery.eq('author_id', authorFilter);

    const { data: guidesRaw } = await guideQuery;
    const guides = (guidesRaw ?? []) as any[];
    const guideIds = guides.map((guide) => guide.id);
    const authorIds = Array.from(new Set(guides.map((guide) => guide.author_id).filter(Boolean) as string[]));

    const { data: profilesRaw } = authorIds.length > 0
      ? await db
          .from('user_profiles')
          .select('user_id, handle, display_name, auto_publish_enabled')
          .in('user_id', authorIds)
      : { data: [] as any[] };
    const profileByUserId = new Map((profilesRaw ?? []).map((profile: any) => [profile.user_id, profile]));

    const { data: submissionsRaw } = guideIds.length > 0
      ? await db
          .from('guide_submissions')
          .select('id, guide_id, submitted_at, reviewed_at, reviewed_by, decision, notes')
          .in('guide_id', guideIds)
          .order('submitted_at', { ascending: false })
      : { data: [] as any[] };
    const submissions = (submissionsRaw ?? []) as any[];

    const latestSubmissionByGuide = new Map<string, any>();
    const latestReviewByGuide = new Map<string, any>();
    for (const submission of submissions) {
      if (!latestSubmissionByGuide.has(submission.guide_id)) {
        latestSubmissionByGuide.set(submission.guide_id, submission);
      }
      if (submission.reviewed_at && !latestReviewByGuide.has(submission.guide_id)) {
        latestReviewByGuide.set(submission.guide_id, submission);
      }
    }

    const reviewerEmails = await authEmailMap(
      db,
      Array.from(latestReviewByGuide.values()).map((row) => row.reviewed_by).filter(Boolean),
    );

    reviewRows = guides.map((guide) => {
      const profile = guide.author_id ? profileByUserId.get(guide.author_id) as any : null;
      const submission = latestSubmissionByGuide.get(guide.id);
      const review = latestReviewByGuide.get(guide.id);
      return {
        id: guide.id,
        title: guide.title,
        slug: guide.slug,
        status: guide.status,
        city: guide.city ?? null,
        neighborhood: guide.neighborhood ?? null,
        tags: guide.tags ?? [],
        author_id: guide.author_id ?? null,
        author_handle: profile?.handle ?? null,
        author_display_name: profile?.display_name ?? null,
        author_auto_publish_enabled: Boolean(profile?.auto_publish_enabled),
        submitted_at: submission?.submitted_at ?? null,
        reviewed_at: review?.reviewed_at ?? null,
        reviewer_email: review?.reviewed_by ? reviewerEmails.get(review.reviewed_by) ?? null : null,
        published_at: guide.published_at ?? null,
        updated_at: guide.updated_at,
      };
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Admin
              </Link>
              <span className="text-muted-light">/</span>
              <span className="text-body-sm text-foreground">Guides</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Guide Review</h1>
            <p className="text-body-sm text-muted mt-1">
              Review, preview, approve, reject, or unpublish Super User guides.
            </p>
          </div>
          <Link href="/admin">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Admin
            </span>
          </Link>
        </div>

        {noticeText ? (
          <div className="rounded-md border border-success bg-success-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-success">{noticeText}</p>
          </div>
        ) : null}

        {errorText ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Action failed</p>
            <p className="text-body-sm text-error/80 mt-0.5">{errorText}</p>
          </div>
        ) : null}

        {authorFilterLabel ? (
          <div className="rounded-md border border-border bg-surface px-4 py-3 mb-6 flex items-center justify-between">
            <p className="text-body-sm text-muted">
              Showing guides and submissions for <span className="font-semibold text-foreground">{authorFilterLabel}</span>.
            </p>
            <Link href={`/admin/guides?tab=${tab}`} className="text-caption font-semibold text-brand hover:underline">
              Clear filter
            </Link>
          </div>
        ) : null}

        <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
          {Object.entries(TAB_LABELS).map(([key, label]) => (
            <Link
              key={key}
              href={`/admin/guides?tab=${key}${authorFilter ? `&author=${authorFilter}` : ''}`}
              className={`px-4 py-2 text-body-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                tab === key
                  ? 'border-brand text-foreground'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              {label}
              {tabCounts[key] > 0 ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand-dark-alt">
                  {tabCounts[key]}
                </span>
              ) : null}
            </Link>
          ))}
        </div>

        {tab === 'audit' ? (
          <GuideAuditTable rows={auditRows} />
        ) : (
          <GuidesReviewTable
            rows={reviewRows}
            emptyMessage={`No ${TAB_LABELS[tab].toLowerCase()} guides found.`}
          />
        )}
      </main>
    </div>
  );
}
