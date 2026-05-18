'use client';

import { useState, useTransition } from 'react';
import { approveGuide, rejectGuide, unpublishGuide } from '@/actions/guide-review-actions';

export type GuideReviewRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  city: string | null;
  author_handle: string | null;
  author_display_name: string | null;
  published_at: string | null;
  updated_at: string;
};

function relativeDate(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function RejectForm({ guideId, onCancel }: { guideId: string; onCancel: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form className="mt-2 p-3 rounded-md border border-border bg-background">
      <input type="hidden" name="id" value={guideId} />
      <label htmlFor={`notes-${guideId}`} className="text-caption font-medium text-foreground block mb-1">
        Feedback for author <span className="text-muted font-normal">(optional)</span>
      </label>
      <textarea
        id={`notes-${guideId}`}
        name="notes"
        rows={3}
        placeholder="Let the author know what to improve…"
        className="flex w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors resize-none"
      />
      <div className="flex gap-2 mt-2">
        <button
          formAction={rejectGuide}
          disabled={isPending}
          onClick={() => startTransition(() => {})}
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

export function PendingGuidesTable({ rows }: { rows: GuideReviewRow[] }) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-10 text-center">
        <p className="text-body-sm text-muted">No guides pending review.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b border-border bg-background/50">
            <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Title</th>
            <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden sm:table-cell">Author</th>
            <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">City</th>
            <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Submitted</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <span className="font-medium text-foreground">{g.title}</span>
                <span className="block text-caption text-muted-light mt-0.5">{g.slug}</span>
                {rejectingId === g.id ? (
                  <RejectForm guideId={g.id} onCancel={() => setRejectingId(null)} />
                ) : null}
              </td>
              <td className="px-4 py-3 text-muted hidden sm:table-cell">
                {g.author_handle ? `@${g.author_handle}` : g.author_display_name ?? '—'}
              </td>
              <td className="px-4 py-3 text-muted hidden md:table-cell">{g.city ?? '—'}</td>
              <td className="px-4 py-3 text-muted">{relativeDate(g.updated_at)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3 justify-end">
                  <form>
                    <input type="hidden" name="id" value={g.id} />
                    <button
                      formAction={approveGuide}
                      disabled={isPending}
                      onClick={() => startTransition(() => {})}
                      className="text-caption font-medium text-success hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </form>
                  {rejectingId !== g.id ? (
                    <button
                      type="button"
                      onClick={() => setRejectingId(g.id)}
                      className="text-caption font-medium text-error hover:underline cursor-pointer"
                    >
                      Reject
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PublishedGuidesTable({ rows }: { rows: GuideReviewRow[] }) {
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-10 text-center">
        <p className="text-body-sm text-muted">No published guides.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b border-border bg-background/50">
            <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Title</th>
            <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden sm:table-cell">Author</th>
            <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">City</th>
            <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Published</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
              <td className="px-4 py-3">
                <span className="font-medium text-foreground">{g.title}</span>
                <span className="block text-caption text-muted-light mt-0.5">{g.slug}</span>
              </td>
              <td className="px-4 py-3 text-muted hidden sm:table-cell">
                {g.author_handle ? `@${g.author_handle}` : g.author_display_name ?? '—'}
              </td>
              <td className="px-4 py-3 text-muted hidden md:table-cell">{g.city ?? '—'}</td>
              <td className="px-4 py-3 text-muted">
                {g.published_at ? relativeDate(g.published_at) : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <form>
                  <input type="hidden" name="id" value={g.id} />
                  <button
                    formAction={unpublishGuide}
                    disabled={isPending}
                    onClick={() => startTransition(() => {})}
                    className="text-caption font-medium text-error hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Unpublish
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
