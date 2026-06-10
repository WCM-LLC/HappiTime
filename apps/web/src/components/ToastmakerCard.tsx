'use client';

import { useState, useEffect, useCallback } from 'react';

type ToastmakerNominee = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  own_checkins: number;
  attributed_first_visits: number;
  attributed_redemptions: number;
  score: number;
};

type VenueToastmaker = {
  id: string;
  user_id: string;
  quarter: string;
  ratified_by: string | null;
  created_at: string;
  handle: string | null;
  display_name: string | null;
};

type ToastmakerData = {
  nominee: ToastmakerNominee | null;
  ratified: VenueToastmaker | null;
};

/** Returns "YYYY-Q#" for the current UTC instant — mirrors route + SQL. */
function currentQuarter(date: Date): string {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

export function ToastmakerCard({ venueId }: { venueId: string }) {
  const [data, setData] = useState<ToastmakerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<'ratify' | 'pass' | null>(null);
  const [passed, setPassed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check localStorage for a session-persistent pass for this venue+quarter.
  const passKey = `toastmaker-passed:${venueId}:${currentQuarter(new Date())}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/venues/${venueId}/toastmaker`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      const json: ToastmakerData = await res.json();
      setData(json);
    } catch {
      setError('Failed to load Toastmaker data.');
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    // Check localStorage for a pass state persisted from a previous session.
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem(passKey) === '1') {
        setPassed(true);
      }
    }
    fetchData();
  }, [fetchData, passKey]);

  const handleRatify = async () => {
    if (!data?.nominee) return;
    setActionPending('ratify');
    setError(null);
    try {
      const res = await fetch(`/api/venues/${venueId}/toastmaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ratify', user_id: data.nominee.user_id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      // Refetch to show the ratified state.
      await fetchData();
    } catch {
      setError('Ratify request failed.');
    } finally {
      setActionPending(null);
    }
  };

  const handlePass = async () => {
    if (!data?.nominee) return;
    setActionPending('pass');
    setError(null);
    try {
      const res = await fetch(`/api/venues/${venueId}/toastmaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pass' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      // Persist the pass in localStorage so reload keeps the dismissed state.
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(passKey, '1');
      }
      setPassed(true);
    } catch {
      setError('Pass request failed.');
    } finally {
      setActionPending(null);
    }
  };

  // Shared card shell classes (mirror page.tsx conventions)
  const btnPrimary =
    'inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const btnSecondary =
    'inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  const cardContent = () => {
    if (loading) {
      return <p className="text-body-sm text-muted">Loading…</p>;
    }

    if (error) {
      return <p className="text-body-sm text-error">{error}</p>;
    }

    // Already ratified this quarter
    if (data?.ratified) {
      const r = data.ratified;
      // Use profile fields resolved by the route (ratified user may differ from nominee).
      const label = r.display_name
        ? `${r.display_name}${r.handle ? ` (@${r.handle})` : ''}`
        : r.handle
          ? `@${r.handle}`
          : r.user_id.slice(0, 8) + '…';
      return (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
            <span className="text-heading-sm">&#x1F942;</span>
          </div>
          <div>
            <p className="text-body-md font-semibold text-foreground">
              This quarter&apos;s Toastmaker: {label}
            </p>
            <p className="text-body-sm text-muted mt-0.5">Quarter {r.quarter}</p>
          </div>
        </div>
      );
    }

    // Passed for the quarter — quiet empty state
    if (passed) {
      return (
        <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-6 text-center">
          <p className="text-body-sm text-muted">
            Toastmaker nominee skipped for this quarter.
          </p>
        </div>
      );
    }

    // Eligible nominee present
    if (data?.nominee) {
      const n = data.nominee;
      const displayLabel = n.display_name ?? n.handle ?? 'Unknown';
      const handleLabel = n.handle ? `@${n.handle}` : null;

      return (
        <div className="flex flex-col gap-4">
          {/* Nominee profile row */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
              <span className="text-heading-sm">&#x1F942;</span>
            </div>
            <div>
              <h3 className="text-body-md font-semibold text-foreground">{displayLabel}</h3>
              {handleLabel && (
                <p className="text-body-sm text-muted mt-0.5">{handleLabel}</p>
              )}
            </div>
          </div>

          {/* Score breakdown */}
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left text-caption font-medium text-muted px-4 py-2">Metric</th>
                  <th className="text-right text-caption font-medium text-muted px-4 py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Own check-ins', value: n.own_checkins },
                  { label: 'Attributed first visits', value: n.attributed_first_visits },
                  { label: 'Attributed redemptions', value: n.attributed_redemptions },
                  { label: 'Score', value: n.score },
                ].map((row, i) => (
                  <tr
                    key={row.label}
                    className={`border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-background/50'}`}
                  >
                    <td className="text-body-sm text-foreground px-4 py-2.5">{row.label}</td>
                    <td className="text-body-sm text-muted text-right tabular-nums px-4 py-2.5">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              className={btnPrimary}
              onClick={handleRatify}
              disabled={actionPending !== null}
            >
              {actionPending === 'ratify' ? 'Approving…' : 'Approve'}
            </button>
            <button
              className={btnSecondary}
              onClick={handlePass}
              disabled={actionPending !== null}
            >
              {actionPending === 'pass' ? 'Passing…' : 'Pass'}
            </button>
          </div>
        </div>
      );
    }

    // No nominee
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-6 text-center">
        <p className="text-body-sm font-medium text-foreground">
          No eligible Toastmaker nominee yet this quarter.
        </p>
        <p className="text-body-sm text-muted mt-1">
          Check back once more check-ins have been recorded.
        </p>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
      <div className="mb-5">
        <h2 className="text-heading-sm font-semibold text-foreground">Toastmaker</h2>
        <p className="text-body-sm text-muted mt-0.5">
          The guest who brought the most energy to your venue this quarter.
        </p>
      </div>
      {cardContent()}
    </div>
  );
}
