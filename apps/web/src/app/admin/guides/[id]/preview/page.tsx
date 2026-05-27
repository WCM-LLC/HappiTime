/* eslint-disable @next/next/no-img-element */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import UserBar from '@/components/layout/UserBar';
import { createServiceClient } from '@/utils/supabase/server';
import { normalizeGuideCoverImageUrl } from '@/utils/guide-cover-url';
import { ReviewControls } from './ReviewControls';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function statusClass(status: string | null) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold';
  if (status === 'published') return `${base} bg-success-light text-success`;
  if (status === 'pending_review') return `${base} bg-warning-light text-warning`;
  if (status === 'archived') return `${base} bg-surface border border-border text-muted-light`;
  return `${base} bg-surface border border-border text-muted`;
}

export default async function AdminGuidePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServiceClient();

  const { data: guideRaw } = await db
    .from('guides')
    .select('id, title, subtitle, slug, status, city, neighborhood, tags, cover_image_url, body_md, author_id, published_at, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (!guideRaw) notFound();
  const guide = guideRaw as any;

  const [{ data: authorRaw }, { data: submissionsRaw }] = await Promise.all([
    guide.author_id
      ? db
          .from('user_profiles')
          .select('user_id, handle, display_name, avatar_url, auto_publish_enabled')
          .eq('user_id', guide.author_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('guide_submissions')
      .select('id, guide_id, submitted_by, submitted_at, reviewed_by, reviewed_at, decision, notes')
      .eq('guide_id', id)
      .order('submitted_at', { ascending: false }),
  ]);

  const author = authorRaw as any;
  const submissions = (submissionsRaw ?? []) as any[];
  const reviewerIds = Array.from(new Set(submissions.map((row) => row.reviewed_by).filter(Boolean)));
  const reviewerEmailById = new Map<string, string>();
  await Promise.all(
    reviewerIds.map(async (reviewerId) => {
      const { data } = await (db as any).auth.admin.getUserById(reviewerId);
      if (data?.user?.email) reviewerEmailById.set(reviewerId, data.user.email);
    }),
  );

  const authorLabel = author?.handle ? `@${author.handle}` : author?.display_name ?? 'Unknown author';
  const coverImageUrl = normalizeGuideCoverImageUrl(guide.cover_image_url);

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6">
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
              <span className="text-body-sm text-foreground">Preview</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Guide Preview</h1>
            <p className="text-body-sm text-muted mt-1">
              This preview does not publish or expose the guide publicly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/guides/${guide.id}/edit`}>
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
                Edit guide
              </span>
            </Link>
            <Link href="/admin/guides">
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
                &larr; Guide Review
              </span>
            </Link>
          </div>
        </div>

        <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-body-sm font-semibold text-warning">Preview Mode</p>
            <p className="text-body-sm text-warning/80">
              Status: <span className="font-semibold">{guide.status.replace('_', ' ')}</span>. This page is admin-only.
            </p>
          </div>
          <span className={statusClass(guide.status)}>{guide.status.replace('_', ' ')}</span>
        </div>

        <div className="mb-6">
          <ReviewControls guideId={guide.id} status={guide.status} />
        </div>

        <article className="rounded-lg border border-border bg-surface shadow-sm p-6 md:p-8 mb-8">
          {coverImageUrl ? (
            <div className="rounded-lg overflow-hidden mb-8 aspect-[2/1] bg-cream">
              <img
                src={coverImageUrl}
                alt={guide.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}

          <header className="mb-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {guide.city ? (
                <span className="text-caption font-semibold text-brand uppercase tracking-wider">
                  {guide.city}
                </span>
              ) : null}
              {guide.neighborhood ? (
                <span className="text-caption text-muted">/ {guide.neighborhood}</span>
              ) : null}
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-3">
              {guide.title}
            </h2>
            {guide.subtitle ? (
              <p className="text-lg text-muted leading-relaxed">{guide.subtitle}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="text-caption text-muted">By {authorLabel}</span>
              {author?.auto_publish_enabled ? (
                <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand-dark-alt">
                  auto-publish enabled
                </span>
              ) : null}
            </div>
            {guide.tags && guide.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {guide.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border px-3 py-0.5 text-xs font-medium text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </header>

          <div className="prose prose-gray max-w-none">
            <ReactMarkdown>{guide.body_md ?? ''}</ReactMarkdown>
          </div>
        </article>

        <section id="history" className="mb-8 scroll-mt-20">
          <h2 className="text-heading-sm font-semibold text-foreground mb-4">Submission History</h2>
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            {submissions.length === 0 ? (
              <p className="text-body-sm text-muted p-5">No submission history yet.</p>
            ) : (
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Event</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Submitted</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Reviewed</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Reviewer</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{row.decision ?? 'submitted'}</span>
                        {row.notes ? <span className="block text-caption text-muted mt-0.5">{row.notes}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatDate(row.submitted_at)}</td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell">{formatDate(row.reviewed_at)}</td>
                      <td className="px-4 py-3 text-muted hidden lg:table-cell">
                        {row.reviewed_by ? reviewerEmailById.get(row.reviewed_by) ?? row.reviewed_by : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <ReviewControls guideId={guide.id} status={guide.status} />
      </main>
    </div>
  );
}
