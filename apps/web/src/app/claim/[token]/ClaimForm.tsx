'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function ClaimForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function publish() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/intake/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          setError(json?.error ?? 'publish_failed');
          return;
        }
        router.refresh();
      } catch (err: any) {
        setError(err?.message ?? 'publish_failed');
      }
    });
  }

  return (
    <div style={{ marginTop: 24 }}>
      <button
        onClick={publish}
        disabled={pending}
        style={{
          background: '#111',
          color: '#fff',
          border: 0,
          padding: '14px 22px',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: pending ? 'wait' : 'pointer',
          width: '100%',
        }}
      >
        {pending ? 'Publishing…' : 'Looks right — publish'}
      </button>
      {error ? (
        <p style={{ color: '#b91c1c', marginTop: 12 }}>
          Something went wrong: {error}. Please reply to the email if it keeps failing.
        </p>
      ) : null}
    </div>
  );
}
