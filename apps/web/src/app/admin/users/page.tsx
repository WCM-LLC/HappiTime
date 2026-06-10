import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { SuperUsersTable, type SuperUserRow } from './SuperUsersTable';

const NOTICE: Record<string, string> = {
  user_promoted: 'User promoted to Super User.',
  user_revoked: 'Super User role revoked.',
  auto_publish_updated: 'Auto-publish setting updated.',
};

const ERRORS: Record<string, string> = {
  missing_user_id: 'No user was selected.',
  user_not_found: 'User profile not found.',
  not_super_user: 'Auto-publish can only be set on Super Users.',
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const noticeText = sp.notice ? (NOTICE[sp.notice] ?? null) : null;
  const errorText = sp.error ? (ERRORS[sp.error] ?? sp.error) : null;

  const keyError = getServiceRoleKeyError();
  let rows: SuperUserRow[] = [];

  if (!keyError) {
    const db = createServiceClient();
    const { data } = await db
      .from('user_profiles')
      .select('user_id, handle, display_name, avatar_url, role, auto_publish_enabled, created_at, is_public')
      .order('role', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000);

    const profiles = (data ?? []) as any[];
    const userIds = profiles.map((r) => r.user_id as string).filter(Boolean);
    const emailByUserId = new Map<string, string>();

    let page = 1;
    while (userIds.length > 0) {
      const { data: authUsers, error } = await (db as any).auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      for (const u of authUsers?.users ?? []) {
        if (userIds.includes(u.id) && u.email) emailByUserId.set(u.id, u.email);
      }
      if (!authUsers?.nextPage) break;
      page = authUsers.nextPage;
    }

    const publishedCountByUserId = new Map<string, number>();
    const pendingCountByUserId = new Map<string, number>();
    if (userIds.length > 0) {
      const { data: guides } = await db
        .from('guides')
        .select('id, author_id, status')
        .in('author_id', userIds);
      for (const guide of (guides ?? []) as any[]) {
        if (!guide.author_id) continue;
        if (guide.status === 'published') {
          publishedCountByUserId.set(
            guide.author_id,
            (publishedCountByUserId.get(guide.author_id) ?? 0) + 1,
          );
        }
        if (guide.status === 'pending_review') {
          pendingCountByUserId.set(
            guide.author_id,
            (pendingCountByUserId.get(guide.author_id) ?? 0) + 1,
          );
        }
      }
    }

    const lastSubmissionByUserId = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: submissions } = await db
        .from('guide_submissions')
        .select('submitted_by, submitted_at')
        .in('submitted_by', userIds)
        .order('submitted_at', { ascending: false });
      for (const submission of (submissions ?? []) as any[]) {
        if (submission.submitted_by && !lastSubmissionByUserId.has(submission.submitted_by)) {
          lastSubmissionByUserId.set(submission.submitted_by, submission.submitted_at);
        }
      }
    }

    const { data: refRows } = await (db as any).from('super_user_referral_summary').select('*');
    let trafficRows: any[] = [];
    {
      const { data: t, error: tErr } = await (db as any).from('super_user_traffic_summary').select('*');
      if (!tErr && t) trafficRows = t;   // view may not exist pre-Phase-1 → leave empty
    }

    const referralByUserId = new Map<string, any>();
    for (const row of (refRows ?? []) as any[]) {
      if (row.super_user_id) referralByUserId.set(row.super_user_id, row);
    }
    const trafficByUserId = new Map<string, any>();
    for (const row of trafficRows) {
      if (row.super_user_id) trafficByUserId.set(row.super_user_id, row);
    }

    rows = profiles.map((r) => {
      const ref = referralByUserId.get(r.user_id);
      const traffic = trafficByUserId.get(r.user_id);
      return {
        user_id: r.user_id as string,
        handle: r.handle as string | null,
        display_name: r.display_name as string | null,
        avatar_url: r.avatar_url as string | null,
        email: emailByUserId.get(r.user_id) ?? null,
        role: (r.role ?? 'user') as 'user' | 'super_user',
        auto_publish_enabled: Boolean(r.auto_publish_enabled),
        created_at: r.created_at as string,
        is_public: Boolean(r.is_public),
        published_guide_count: publishedCountByUserId.get(r.user_id) ?? 0,
        pending_submission_count: pendingCountByUserId.get(r.user_id) ?? 0,
        last_submission_at: lastSubmissionByUserId.get(r.user_id) ?? null,
        referees: ref?.referees ?? 0,
        itinerary_saves: ref?.itinerary_saves ?? 0,
        first_checkins_driven: traffic?.first_checkins_driven,
        venues_touched: traffic?.venues_touched,
        redemptions_driven: traffic?.redemptions_driven,
      };
    });
  }

  const superUserCount = rows.filter((r) => r.role === 'super_user').length;

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Admin
              </Link>
              <span className="text-muted-light">/</span>
              <span className="text-body-sm text-foreground">Users</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Users</h1>
            <p className="text-body-sm text-muted mt-1">
              Manage Super User roles and auto-publish settings.{' '}
              <span className="font-medium text-foreground">{superUserCount}</span> active Super{' '}
              {superUserCount === 1 ? 'User' : 'Users'}.
            </p>
          </div>
          <Link href="/admin">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Admin
            </span>
          </Link>
        </div>

        {/* Notice */}
        {noticeText ? (
          <div className="rounded-md border border-success bg-success-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-success">{noticeText}</p>
          </div>
        ) : null}

        {/* Error */}
        {errorText ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Action failed</p>
            <p className="text-body-sm text-error/80 mt-0.5">{errorText}</p>
          </div>
        ) : null}

        {/* No service key warning */}
        {keyError ? (
          <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-warning">Limited mode</p>
            <p className="text-body-sm text-warning/80 mt-0.5">
              Add{' '}
              <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">
                SUPABASE_SERVICE_ROLE_KEY
              </code>{' '}
              to view and manage users.
            </p>
          </div>
        ) : null}

        {keyError ? null : <SuperUsersTable rows={rows} />}
      </main>
    </div>
  );
}
