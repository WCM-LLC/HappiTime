'use client';

import { useState, useTransition } from 'react';
import { confirmVenueClosed, dismissClosureReview } from '@/actions/admin-closure-review-actions';

export function ClosureReviewActions({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [mode, setMode] = useState<'idle' | 'confirm' | 'dismiss'>('idle');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  function run(action: (id: string) => Promise<unknown>) {
    setErr('');
    startTransition(async () => {
      try {
        await action(venueId);
        // Row disappears on revalidate.
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Action failed');
      }
    });
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-col gap-1.5 min-w-[180px]">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('confirm')}
            className="h-7 px-3 rounded bg-error text-white text-caption font-medium hover:opacity-80 transition-opacity cursor-pointer"
          >
            Confirm closed
          </button>
          <button
            type="button"
            onClick={() => setMode('dismiss')}
            className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
        {err && <p className="text-caption text-error">{err}</p>}
      </div>
    );
  }

  if (mode === 'confirm') {
    return (
      <div className="flex flex-col gap-1.5 min-w-[220px]">
        <p className="text-caption text-error font-medium">
          Permanently delete {venueName} and all its data? This cannot be undone.
        </p>
        {err && <p className="text-caption text-error">{err}</p>}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => run(confirmVenueClosed)}
            disabled={isPending}
            className="h-7 px-3 rounded bg-error text-white text-caption font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer"
          >
            {isPending ? 'Deleting…' : 'Delete venue'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('idle'); setErr(''); }}
            disabled={isPending}
            className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // mode === 'dismiss'
  return (
    <div className="flex flex-col gap-1.5 min-w-[200px]">
      <p className="text-caption text-muted">
        Keep this venue and stop re-flagging it as closed?
      </p>
      {err && <p className="text-caption text-error">{err}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => run(dismissClosureReview)}
          disabled={isPending}
          className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isPending ? 'Dismissing…' : 'Confirm dismiss'}
        </button>
        <button
          type="button"
          onClick={() => { setMode('idle'); setErr(''); }}
          disabled={isPending}
          className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
