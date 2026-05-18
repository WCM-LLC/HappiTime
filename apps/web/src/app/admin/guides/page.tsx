import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createServiceClient } from '@/utils/supabase/server';
import {
  PendingGuidesTable,
  PublishedGuidesTable,
  type GuideReviewRow,
} from './AdminGuidesTable';

const NOTICE: Record<string, string> = {
  guide_approved: 'Guide approved and published.',
  guide_rejected: 'Guide returned to draft.',
  guide_unpublished: 'Guide unpublished.',
};

const ERRORS: Record<string, string> = {
  missing_guide_id: 'No guide was selected.',
  approve_failed: 'Approval failed — try again.',
  reject_failed: 'Rejection failed — try again.',
  unpublish_failed: 'Unpublish failed — try again.',
};

export default async function AdminGuidesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; notice?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === 'published' ? 'published' : 'pending';
  const noticeText = sp.notice ? (NOTICE[sp.notice] ?? null) : null;
  const errorText = sp.error ? (ERRORS[sp.error] ?? sp.error) : null;

  const db = createServiceClient();

  // Fetch guides for the active tab
  const status = tab === 'published' ? 'published' : 'pending_review';
  const { data: guidesRaw } = await (db as any)
    .from('guides')
    .select('id, title, slug, status, city, author_id, published_at, updated_at')
    .eq('status', status)
    .order('updated_at', { ascending: false })
    .limit(100);

  const guides = (guidesRaw ?? []) as any[];

  // Fetch author profiles in one query
  const authorIds = Array.from(
    new Set(guides.map((g) => g.author_id).filter(Boolean) as string[]),
  );
  const profileMap = new Map<string, { handle: string | null; display_name: string | null }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await db
      .from('user_profiles')
      .select('user_id, handle, display_name')
      .in('user_id', authorIds);
    for (const p of (profiles ?? []) as any[]) {
      profileMap.set(p.user_id, { handle: p.handle, display_name: p.display_name });
    }
  }

  const rows: GuideReviewRow[] = guides.map((g) => {
    const author = profileMap.get(g.author_id) ?? { handle: null, display_name: null };
    return {
      id: g.id,
      title: g.title,
      slug: g.slug,
      status: g.status,
      city: g.city ?? null,
      author_handle: author.handle,
      author_display_name: author.display_name,
      published_at: g.published_at ?? null,
      updated_at: g.updated_at,
    };
  });

  const pendingCount = tab === 'pending' ? rows.length : null;

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
              <span className="text-body-sm text-foreground">Guides</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Guide Review</h1>
            <p className="text-body-sm text-muted mt-1">
              Approve, reject, or unpublish Super User guides.
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

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          <Link
            href="/admin/guides?tab=pending"
            className={`px-4 py-2 text-body-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'pending'
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Pending review
            {pendingCount !== null && pendingCount > 0 ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand-dark-alt">
                {pendingCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/admin/guides?tab=published"
            className={`px-4 py-2 text-body-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'published'
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Published
          </Link>
        </div>

        {/* Table */}
        {tab === 'pending' ? (
          <PendingGuidesTable rows={rows} />
        ) : (
          <PublishedGuidesTable rows={rows} />
        )}
      </main>
    </div>
  );
}
