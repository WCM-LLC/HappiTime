'use client';

import { useState, useTransition } from 'react';
import { bundleTierForCount, rateForBundleTier, type BundleTier } from '@/utils/bundle';

const TIER_LABEL: Record<BundleTier, string> = {
  bundle_2_4: 'Bundle · 2–4 venues',
  bundle_5_plus: 'Bundle · 5+ venues',
};

export type OrgBundleSummary = {
  tier: BundleTier;
  status: string;
  venueCount: number;
  monthlyRatePerVenueCents: number;
  currentPeriodEnd: string | null;
  canManageBilling: boolean;
};

type Props = {
  orgId: string;
  venueCount: number;
  bundle: OrgBundleSummary | null;
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function OrgBundlePanel({ orgId, venueCount, bundle }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function post(url: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Something went wrong'); return; }
        window.location.href = data.url;
      } catch {
        setError('Network error — please try again');
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-heading-sm font-semibold text-foreground">Org bundle</h2>
        {bundle?.canManageBilling && (
          <button
            onClick={() => post('/api/stripe/org-portal')}
            disabled={pending}
            className="h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors disabled:opacity-50"
          >
            Manage billing
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-error bg-red-50 px-4 py-3 mb-5">
          <p className="text-body-sm text-error">{error}</p>
        </div>
      )}

      {bundle ? (
        <div>
          <p className="text-body-sm text-muted">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-amber-50 text-amber-700">
              {TIER_LABEL[bundle.tier]}
            </span>{' '}
            <span className="ml-2">{bundle.status}</span>
          </p>
          <p className="mt-3 text-display-sm font-bold text-foreground">
            {dollars(bundle.monthlyRatePerVenueCents * bundle.venueCount)}
            <span className="text-body-sm text-muted font-normal">/mo</span>
          </p>
          <p className="text-body-sm text-muted">
            {bundle.venueCount} venues × {dollars(bundle.monthlyRatePerVenueCents)}/venue
            {bundle.currentPeriodEnd ? ` · renews ${new Date(bundle.currentPeriodEnd).toLocaleDateString()}` : ''}
          </p>
          <p className="mt-4 text-caption text-muted">
            {bundle.canManageBilling
              ? 'Cancelling your bundle returns all venues to Listed.'
              : 'Comped pilot bundle — contact support to change.'}
          </p>
        </div>
      ) : (
        <StartBundle orgId={orgId} venueCount={venueCount} pending={pending} onStart={() => post('/api/stripe/org-checkout')} />
      )}
    </div>
  );
}

function StartBundle({ venueCount, pending, onStart }: { orgId: string; venueCount: number; pending: boolean; onStart: () => void }) {
  const tier = bundleTierForCount(venueCount);
  if (!tier) {
    return <p className="text-body-sm text-muted">A bundle needs at least 2 venues. You have {venueCount}.</p>;
  }
  const monthly = rateForBundleTier(tier) * venueCount;
  return (
    <div>
      <p className="text-body-sm text-muted mb-3">
        {venueCount} venues → {dollars(rateForBundleTier(tier))}/venue ={' '}
        <span className="font-semibold text-foreground">{dollars(monthly)}/mo</span> ({TIER_LABEL[tier]})
      </p>
      <button
        onClick={onStart}
        disabled={pending}
        className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
      >
        Start bundle
      </button>
    </div>
  );
}
