import Link from 'next/link';
import { notFound } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { saveAdminGuide } from '@/actions/guide-review-actions';
import { createServiceClient } from '@/utils/supabase/server';
import { GuideEditor } from '@/app/dashboard/guides/components/GuideEditor';

export const dynamic = 'force-dynamic';

const NOTICE: Record<string, string> = {
  guide_saved: 'Guide saved.',
};

const ERRORS: Record<string, string> = {
  guide_not_found: 'Guide not found.',
  missing_guide_id: 'No guide was selected.',
  save_failed: 'Save failed — try again.',
  title_required: 'Title is required.',
};

function statusClass(status: string | null) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold';
  if (status === 'published') return `${base} bg-success-light text-success`;
  if (status === 'pending_review') return `${base} bg-warning-light text-warning`;
  if (status === 'archived') return `${base} bg-surface border border-border text-muted-light`;
  return `${base} bg-surface border border-border text-muted`;
}

export default async function AdminGuideEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const noticeText = sp.notice ? (NOTICE[sp.notice] ?? null) : null;
  const errorText = sp.error ? (ERRORS[sp.error] ?? sp.error) : null;

  const db = createServiceClient();
  const { data: guideRaw } = await db
    .from('guides')
    .select('id, title, subtitle, body_md, city, neighborhood, tags, cover_image_url, status, slug')
    .eq('id', id)
    .maybeSingle();

  if (!guideRaw) notFound();
  const guide = guideRaw as any;

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex flex-col gap-4 mb-8 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Admin
              </Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin/guides" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Guides
              </Link>
              <span className="text-muted-light">/</span>
              <span className="text-body-sm text-foreground">Edit</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Edit guide</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">{guide.slug}</code>
              <span className={statusClass(guide.status)}>{guide.status.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/guides/${guide.id}/preview`}>
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
                Preview
              </span>
            </Link>
            <Link href="/admin/guides">
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
                &larr; Guide Review
              </span>
            </Link>
          </div>
        </div>

        <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-6">
          <p className="text-body-sm font-semibold text-warning">Admin Edit Mode</p>
          <p className="text-body-sm text-warning/80 mt-0.5">
            Saving updates this guide in place and keeps its current review status.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <GuideEditor
            id={guide.id}
            initialTitle={guide.title}
            initialSubtitle={guide.subtitle ?? ''}
            initialBodyMd={guide.body_md}
            initialCity={guide.city ?? ''}
            initialNeighborhood={guide.neighborhood ?? ''}
            initialTags={(guide.tags ?? []).join(', ')}
            initialCoverUrl={guide.cover_image_url ?? ''}
            status={guide.status}
            noticeText={noticeText}
            errorText={errorText}
            saveAction={saveAdminGuide}
            saveLabel="Save guide"
            showSubmit={false}
          />
        </div>
      </main>
    </div>
  );
}
