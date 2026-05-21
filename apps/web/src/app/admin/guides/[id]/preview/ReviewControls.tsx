'use client';

import { useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { approveGuide, rejectGuide, unpublishGuide } from '@/actions/guide-review-actions';

function ConfirmingForm({
  message,
  children,
}: {
  message: string;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

export function ReviewControls({ guideId, status }: { guideId: string; status: string }) {
  const [showReject, setShowReject] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (status === 'pending_review') {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <ConfirmingForm message="Approve and publish this guide?">
            <input type="hidden" name="id" value={guideId} />
            <button
              formAction={approveGuide}
              disabled={isPending}
              onClick={() => startTransition(() => {})}
              className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-success text-white text-body-sm font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              Approve
            </button>
          </ConfirmingForm>
          <button
            type="button"
            onClick={() => setShowReject((value) => !value)}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-error hover:bg-background transition-colors cursor-pointer"
          >
            Reject
          </button>
        </div>
        {showReject ? (
          <form
            className="mt-4"
            onSubmit={(event) => {
              if (!window.confirm('Reject this guide and return it to draft?')) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={guideId} />
            <label htmlFor="reject-notes" className="text-body-sm font-medium text-foreground block mb-1.5">
              Review notes
            </label>
            <textarea
              id="reject-notes"
              name="notes"
              rows={4}
              placeholder="Share what needs to change before this guide can be published..."
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors resize-y"
            />
            <div className="mt-3 flex gap-2">
              <button
                formAction={rejectGuide}
                disabled={isPending}
                onClick={() => startTransition(() => {})}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-error text-white text-body-sm font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                Confirm reject
              </button>
              <button
                type="button"
                onClick={() => setShowReject(false)}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  }

  if (status === 'published') {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <ConfirmingForm message="Unpublish this guide and move it to archived?">
          <input type="hidden" name="id" value={guideId} />
          <button
            formAction={unpublishGuide}
            disabled={isPending}
            onClick={() => startTransition(() => {})}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-error text-white text-body-sm font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            Unpublish
          </button>
        </ConfirmingForm>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-body-sm text-muted">
        No publish action is available while this guide is <span className="font-medium text-foreground">{status.replace('_', ' ')}</span>.
      </p>
    </div>
  );
}
