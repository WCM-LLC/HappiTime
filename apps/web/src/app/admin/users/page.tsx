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
      .select('user_id, handle, display_name, role, auto_publish_enabled, created_at, is_public')
      .order('role', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000);

    rows = ((data ?? []) as any[]).map((r) => ({
      user_id: r.user_id as string,
      handle: r.handle as string | null,
      display_name: r.display_name as string | null,
      role: (r.role ?? 'user') as 'user' | 'super_user',
      auto_publish_enabled: Boolean(r.auto_publish_enabled),
      created_at: r.created_at as string,
      is_public: Boolean(r.is_public),
    }));
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
