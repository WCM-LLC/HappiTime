'use client';

import { useState, useTransition } from 'react';
import { adminCreateBundleCheckoutLink } from '@/actions/admin-bundle-actions';

/** Admin-only: generates an org bundle checkout link to share with the owner. */
export function AdminBundleLinkButton({ orgId }: { orgId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function generate() {
    setErr(null);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set('org_id', orgId);
        setUrl(await adminCreateBundleCheckoutLink(fd));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-brand hover:underline text-body-sm">
        Checkout link ↗
      </a>
    );
  }

  return (
    <button
      onClick={generate}
      disabled={pending}
      className="text-brand hover:underline text-body-sm disabled:opacity-50"
      title={err ?? undefined}
    >
      {pending ? 'Generating…' : err ? 'Retry' : 'Gen link'}
    </button>
  );
}
