'use client';

import { useState, useTransition } from 'react';
import { acceptGoogleAddress, dismissAddressReview } from '@/actions/admin-address-review-actions';
import { parseFormattedAddress } from '@/utils/parse-formatted-address.mjs';

export function AddressReviewActions({
  venueId,
  googleAddress,
}: {
  venueId: string;
  googleAddress: string | null;
}) {
  const [mode, setMode] = useState<'idle' | 'accept' | 'dismiss'>('idle');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  const parsed = parseFormattedAddress(googleAddress);
  const [address, setAddress] = useState(parsed.address);
  const [city, setCity] = useState(parsed.city);
  const [stateField, setStateField] = useState(parsed.state);
  const [zip, setZip] = useState(parsed.zip);

  function runAccept() {
    setErr('');
    startTransition(async () => {
      try {
        await acceptGoogleAddress(venueId, { address, city, state: stateField, zip });
        // Row disappears on revalidate; no local state needed.
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Accept failed');
      }
    });
  }

  function runDismiss() {
    setErr('');
    startTransition(async () => {
      try {
        await dismissAddressReview(venueId);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Dismiss failed');
      }
    });
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-col gap-1.5 min-w-[180px]">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('accept')}
            disabled={!googleAddress}
            className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            Accept Google&apos;s
          </button>
          <button
            type="button"
            onClick={() => setMode('dismiss')}
            className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Keep ours
          </button>
        </div>
        {err && <p className="text-caption text-error">{err}</p>}
      </div>
    );
  }

  if (mode === 'accept') {
    return (
      <div className="flex flex-col gap-1.5 min-w-[240px]">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address"
          className="h-8 rounded border border-border bg-background text-body-sm px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
        />
        <div className="flex gap-1.5">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="h-8 w-1/2 rounded border border-border bg-background text-body-sm px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
          <input
            value={stateField}
            onChange={(e) => setStateField(e.target.value)}
            placeholder="ST"
            maxLength={2}
            className="h-8 w-14 rounded border border-border bg-background text-body-sm px-2 uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="ZIP"
            className="h-8 w-24 rounded border border-border bg-background text-body-sm px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
        </div>
        {err && <p className="text-caption text-error">{err}</p>}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={runAccept}
            disabled={isPending}
            className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isPending ? 'Saving…' : 'Save address'}
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
        Keep our address and stop re-flagging this venue?
      </p>
      {err && <p className="text-caption text-error">{err}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={runDismiss}
          disabled={isPending}
          className="h-7 px-3 rounded bg-error text-white text-caption font-medium hover:opacity-80 disabled:opacity-50 transition-colors cursor-pointer"
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
