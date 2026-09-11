'use client';

import { useState } from 'react';

/** Read-only share-link field with a copy button (Super User referrals page). */
export function CopyLinkField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. non-secure context) — leave the field selectable.
    }
  };

  return (
    <div className="flex w-full gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="flex h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 text-body-sm text-foreground"
        aria-label="Your referral link"
      />
      <button
        type="button"
        onClick={copy}
        className="shrink-0 inline-flex items-center justify-center h-9 px-3 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
