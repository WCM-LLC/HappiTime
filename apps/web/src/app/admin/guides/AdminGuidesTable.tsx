'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { approveGuide, rejectGuide, unpublishGuide } from '@/actions/guide-review-actions';
import { STICKY_ACTION_HEAD, STICKY_ACTION_CELL } from '@/utils/stickyActionColumn';

type GuideAction = (formData: FormData) => void | Promise<void>;

export type GuideReviewRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  city: string | null;
  neighborhood: string | null;
  tags: string[];
  author_id: string | null;
  author_handle: string | null;
  author_display_name: string | null;
  author_auto_publish_enabled: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewer_email: string | null;
  published_at: string | null;
  updated_at: string;
};

export type GuideAuditRow = {
  id: string;
  guide_id: string;
  guide_title: string;
  guide_slug: string | null;
  guide_status: string | null;
  author_handle: string | null;
  author_display_name: string | null;
  decision: string | null;
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_email: string | null;
};

function relativeDate(iso: string | null) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function statusClass(status: string | null) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold';
  if (status === 'published') return `${base} bg-success-light text-success`;
  if (status === 'pending_review') return `${base} bg-warning-light text-warning`;
  if (status === 'archived') return `${base} bg-surface border border-border text-muted-light`;
  return `${base} bg-surface border border-border text-muted`;
}

function authorLabel(row: Pick<GuideReviewRow, 'author_handle' | 'author_display_name'>) {
  return row.author_handle ? `@${row.author_handle}` : row.author_display_name ?? '—';
}

function ConfirmingForm({
  action,
  message,
  children,
}: {
  action: GuideAction;
  message: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

function RejectForm({ guideId, onCancel }: { guideId: string; onCancel: () => void }) {
  return (
    <form
      action={rejectGuide}
      className="mt-2 p-3 rounded-md border border-border bg-background"
      onSubmit={(event) => {
        if (!window.confirm('Reject this guide and return it to draft?')) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={guideId} />
      <label htmlFor={`notes-${guideId}`} className="text-caption font-medium text-foreground block mb-1">
        Feedback for author <span className="text-muted font-normal">(optional)</span>
      </label>
      <textarea
        id={`notes-${guideId}`}
        name="notes"
        rows={3}
        placeholder="Let the author know what to improve..."
        className="flex w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors resize-none"
      />
      <div className="flex gap-2 mt-2">
        <button
          type="submit"
          className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-error text-white text-caption font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
        >
          Confirm reject
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-border bg-surface text-caption font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function GuidesReviewTable({
  rows,
  emptyMessage,
}: {
  rows: GuideReviewRow[];
  emptyMessage: string;
}) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-10 text-center">
        <p className="text-body-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Guide</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Author</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Location</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Submitted</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden xl:table-cell">Reviewed</th>
              <th className={`px-4 py-2.5 ${STICKY_ACTION_HEAD}`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 min-w-[240px]">
                  <span className="font-medium text-foreground">{g.title}</span>
                  <span className="block text-caption text-muted-light mt-0.5">{g.slug}</span>
                  {g.tags.length > 0 ? (
                    <span className="block text-caption text-muted mt-1">{g.tags.slice(0, 3).join(', ')}</span>
                  ) : null}
                  {rejectingId === g.id ? (
                    <RejectForm guideId={g.id} onCancel={() => setRejectingId(null)} />
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted min-w-[160px]">
                  {g.author_id ? (
                    <Link href={`/admin/users/${g.author_id}`} className="font-medium text-foreground hover:text-brand transition-colors">
                      {authorLabel(g)}
                    </Link>
                  ) : (
                    authorLabel(g)
                  )}
                  <span className="block text-caption text-muted-light">
                    auto-publish {g.author_auto_publish_enabled ? 'on' : 'off'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={statusClass(g.status)}>{g.status.replace('_', ' ')}</span>
                </td>
                <td className="px-4 py-3 text-muted hidden lg:table-cell">
                  {[g.city, g.neighborhood].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">{relativeDate(g.submitted_at ?? g.updated_at)}</td>
                <td className="px-4 py-3 text-muted hidden xl:table-cell">
                  {relativeDate(g.reviewed_at)}
                  {g.reviewer_email ? <span className="block text-caption text-muted-light">{g.reviewer_email}</span> : null}
                </td>
                <td className={`px-4 py-3 ${STICKY_ACTION_CELL}`}>
                  <div className="flex items-center gap-3 justify-end">
                    <Link href={`/admin/guides/${g.id}/preview`} className="text-caption font-medium text-brand hover:underline">
                      Preview
                    </Link>
                    <Link href={`/admin/guides/${g.id}/edit`} className="text-caption font-medium text-brand hover:underline">
                      Edit
                    </Link>
                    <Link href={`/admin/guides/${g.id}/preview#history`} className="text-caption font-medium text-muted hover:text-foreground hover:underline">
                      History
                    </Link>
                    {g.status === 'pending_review' ? (
                      <>
                        <ConfirmingForm action={approveGuide} message="Approve and publish this guide?">
                          <input type="hidden" name="id" value={g.id} />
                          <button
                            type="submit"
                            className="text-caption font-medium text-success hover:underline cursor-pointer disabled:opacity-50"
                          >
                            Approve
                          </button>
                        </ConfirmingForm>
                        {rejectingId !== g.id ? (
                          <button
                            type="button"
                            onClick={() => setRejectingId(g.id)}
                            className="text-caption font-medium text-error hover:underline cursor-pointer"
                          >
                            Reject
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {g.status === 'published' ? (
                      <ConfirmingForm action={unpublishGuide} message="Unpublish this guide and move it to archived?">
                        <input type="hidden" name="id" value={g.id} />
                        <button
                          type="submit"
                          className="text-caption font-medium text-error hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Unpublish
                        </button>
                      </ConfirmingForm>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GuideAuditTable({ rows }: { rows: GuideAuditRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-10 text-center">
        <p className="text-body-sm text-muted">No guide submission audit rows yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Guide</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Author</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Decision</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Submitted</th>
              <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Reviewed</th>
              <th className={`px-4 py-2.5 ${STICKY_ACTION_HEAD}`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 min-w-[240px]">
                  <span className="font-medium text-foreground">{row.guide_title}</span>
                  <span className="block text-caption text-muted-light">{row.guide_slug ?? row.guide_id}</span>
                  {row.notes ? <span className="block text-caption text-muted mt-1">{row.notes}</span> : null}
                </td>
                <td className="px-4 py-3 text-muted min-w-[150px]">
                  {row.author_handle ? `@${row.author_handle}` : row.author_display_name ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={statusClass(row.decision ?? 'submitted')}>
                    {row.decision ?? 'submitted'}
                  </span>
                  {row.guide_status ? (
                    <span className="block text-caption text-muted-light mt-1">current: {row.guide_status}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">{relativeDate(row.submitted_at)}</td>
                <td className="px-4 py-3 text-muted hidden lg:table-cell">
                  {relativeDate(row.reviewed_at)}
                  {row.reviewer_email ? <span className="block text-caption text-muted-light">{row.reviewer_email}</span> : null}
                </td>
                <td className={`px-4 py-3 text-right ${STICKY_ACTION_CELL}`}>
                  <Link href={`/admin/guides/${row.guide_id}/edit`} className="text-caption font-medium text-brand hover:underline mr-3">
                    Edit
                  </Link>
                  <Link href={`/admin/guides/${row.guide_id}/preview#history`} className="text-caption font-medium text-brand hover:underline">
                    History
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const PendingGuidesTable = GuidesReviewTable;
export const PublishedGuidesTable = GuidesReviewTable;
