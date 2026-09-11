'use client';

import { useState, useTransition } from 'react';

/**
 * Approve / reject controls for one queued submission. The server actions are
 * passed in so the same UI serves both queues — staff at /admin/intake-review
 * and a venue's own org at /orgs/[orgId]/intake-review — each with its own
 * authorization on the far side.
 */
export function IntakeReviewActions({
  submissionId,
  approve,
  reject,
}: {
  submissionId: string;
  approve: (submissionId: string) => Promise<unknown>;
  reject: (submissionId: string, reason?: string) => Promise<unknown>;
}) {
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
            onClick={() => run(() => approve(submissionId))}
            disabled={isPending}
            className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isPending ? 'Approving…' : 'Approve as draft'}
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
        {/* Approving no longer publishes. Without saying so, an approved
            submission looks finished while its menu is still a draft. */}
        <p className="text-caption text-muted">
          Saves it as a draft. Publish from the venue page to make it live.
        </p>
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
          onClick={() => run(() => reject(submissionId, reason))}
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
