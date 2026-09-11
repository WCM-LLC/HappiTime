'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Route-level error boundary for the guides authoring flow.
// Without this, an uncaught render error (e.g. in the markdown editor) makes
// Next.js render a blank page. This surfaces the real error and offers recovery.
export default function GuidesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[guides] route error', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-lg border border-border bg-surface p-6 shadow-sm text-center">
        <h1 className="text-display-sm font-bold text-foreground mb-2">Something went wrong</h1>
        <p className="text-body-sm text-muted mb-4">
          The guides editor hit an unexpected error. Your saved drafts are safe.
        </p>
        <pre className="text-caption text-error bg-error-light border border-error rounded-md p-3 mb-4 overflow-auto text-left whitespace-pre-wrap">
          {error.message || 'Unknown error'}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/dashboard/guides"
            className="inline-flex items-center justify-center h-10 px-5 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors"
          >
            Back to my guides
          </Link>
        </div>
      </div>
    </div>
  );
}
