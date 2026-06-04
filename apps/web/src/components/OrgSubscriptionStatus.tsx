import Link from 'next/link';
import { PLAN_LABEL, PLAN_PRICE } from '@/utils/subscription-features';
import type { SubscriptionPlan } from '@/utils/stripe';

/**
 * OrgSubscriptionStatus — per-venue subscription posture for an org, shown above
 * the Org bundle window on the org dashboard's Venues tab. An org-level summary
 * line plus one row per venue (current plan badge + an Upgrade/Manage link to
 * that venue's existing subscription/checkout page). Read-only here; the actual
 * Stripe flow lives on the per-venue subscription page.
 */

const PLAN_BADGE: Record<SubscriptionPlan, string> = {
  listed: 'bg-background text-muted border border-border',
  verified: 'bg-brand-subtle text-brand-dark-alt',
  featured: 'bg-amber-50 text-amber-700',
  founding_pilot: 'bg-violet-50 text-violet-700',
};

export type VenuePlanRow = { id: string; name: string; plan: SubscriptionPlan };

export function OrgSubscriptionStatus({
  orgId,
  venues,
}: {
  orgId: string;
  venues: VenuePlanRow[];
}) {
  const paid = venues.filter((v) => v.plan !== 'listed');
  const totalMonthly = paid.reduce((sum, v) => sum + (PLAN_PRICE[v.plan] ?? 0), 0);

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-heading-sm font-semibold text-foreground">Subscriptions</h2>
        <p className="text-body-sm text-muted mt-0.5">
          {venues.length} {venues.length === 1 ? 'venue' : 'venues'} · {paid.length} on a paid plan
          {totalMonthly > 0 ? ` · $${totalMonthly}/mo across venues` : ''}
        </p>
      </div>

      {venues.length ? (
        <div className="flex flex-col divide-y divide-border">
          {venues.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-body-sm font-medium text-foreground truncate">{v.name}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium shrink-0 ${PLAN_BADGE[v.plan]}`}
                >
                  {PLAN_LABEL[v.plan]}
                </span>
              </div>
              <Link
                href={`/orgs/${orgId}/venues/${v.id}/subscription`}
                className="inline-flex items-center gap-1 text-body-sm font-medium text-brand hover:text-brand-dark transition-colors shrink-0"
              >
                {v.plan === 'listed' ? 'Upgrade' : 'Manage'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-body-sm text-muted">Add a venue to choose a subscription plan.</p>
      )}
    </div>
  );
}
