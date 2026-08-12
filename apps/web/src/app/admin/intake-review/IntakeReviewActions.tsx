'use client';

import { useState, useTransition } from 'react';
import { approveIntakeSubmission, rejectIntakeSubmission } from '@/actions/admin-intake-review-actions';

export function IntakeReviewActions({ submissionId }: { submissionId: string }) {
  const [mode, setMode] = useState<'idle' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  function run(fn: () => Promise<unknown>) {
    setErr('');
    startTransition(async () => {
      try {
        await fn();
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
            onClick={() => run(() => approveIntakeSubmission(submissionId))}
            disabled={isPending}
            className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isPending ? 'Publishing…' : 'Approve & publish'}
          </button>
          <button
            type="button"
            onClick={() => setMode('reject')}
            disabled={isPending}
            className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Reject
          </button>
        </div>
        {err && <p className="text-caption text-error">{err}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[220px]">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (goes to the submitter)"
        className="h-8 rounded border border-border bg-background text-body-sm px-2 placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
      />
      {err && <p className="text-caption text-error">{err}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => run(() => rejectIntakeSubmission(submissionId, reason))}
          disabled={isPending}
          className="h-7 px-3 rounded bg-error text-white text-caption font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer"
        >
          {isPending ? 'Rejecting…' : 'Confirm reject'}
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
