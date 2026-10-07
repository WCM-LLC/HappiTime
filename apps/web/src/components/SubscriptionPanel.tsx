'use client';

import { useState, useTransition } from 'react';
import { trackEvent } from '@/services/analytics';
import {
  FEATURES,
  PLAN_FEATURES,
  PLAN_PRICE,
  PLAN_LABEL,
  type FeatureKey,
} from '@/utils/subscription-features';
import type { SubscriptionPlan } from '@/utils/stripe';
import { tierBadgeColors, tierBorderColors } from '@/utils/tier-style';

const ALL_PLANS: SubscriptionPlan[] = ['listed', 'verified', 'featured'];

/**
 * Every upgrade control is the same neutral high-emphasis button.
 *
 * Tier identity is carried by the badge and the card border; four differently
 * coloured buttons would compete with each other and with the brand copper,
 * which DESIGN.md reserves for one commitment per view. The previous copper
 * fill also shipped white text at 2.64:1, below the AA floor.
 */
const UPGRADE_BTN = 'bg-dark text-dark-foreground hover:bg-dark/90';

type Props = {
  venueId: string;
  orgId: string;
  currentPlan: SubscriptionPlan;
};

export function SubscriptionPanel({ venueId, orgId, currentPlan }: Props) {
  const [preview, setPreview] = useState<SubscriptionPlan>(currentPlan);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCurrentPlan = (p: SubscriptionPlan) => p === currentPlan;
  const isPaid = currentPlan !== 'listed';

  function handleSelectPlan(plan: SubscriptionPlan) {
    setPreview(plan);
  }

  function handleCheckout(plan: SubscriptionPlan) {
    if (plan === 'listed') return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ venueId, orgId, plan }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Checkout failed'); return; }
        trackEvent('subscription_checkout_started', { plan, org_id: orgId, venue_id: venueId });
        window.location.href = data.url;
      } catch {
        setError('Network error — please try again');
      }
    });
  }

  function handleManageBilling() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ venueId, orgId }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Could not open portal'); return; }
        trackEvent('billing_portal_opened', { org_id: orgId, venue_id: venueId });
        window.location.href = data.url;
      } catch {
        setError('Network error — please try again');
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-heading-sm font-semibold text-foreground">Subscription</h2>
          <p className="text-body-sm text-muted mt-0.5">
            Current plan:{' '}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ml-1 ${tierBadgeColors(currentPlan)}`}>
              {PLAN_LABEL[currentPlan]}
            </span>
          </p>
        </div>
        {isPaid && (
          <button
            onClick={handleManageBilling}
            disabled={pending}
            className="h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors disabled:opacity-50"
          >
            Manage billing
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-5">
          <p className="text-body-sm text-error">{error}</p>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        {ALL_PLANS.map((plan) => {
          const price = PLAN_PRICE[plan];
          const isCurrent = isCurrentPlan(plan);
          const isPreviewed = preview === plan;

          return (
            <div
              key={plan}
              onClick={() => handleSelectPlan(plan)}
              className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${tierBorderColors(plan)} ${
                isPreviewed ? 'shadow-md' : 'opacity-70 hover:opacity-90'
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-caption font-medium bg-background border border-border rounded-full px-2 py-0.5 whitespace-nowrap">
                  Current
                </span>
              )}
              <div className="mb-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${tierBadgeColors(plan)}`}>
                  {PLAN_LABEL[plan]}
                </span>
              </div>
              <div className="mb-4">
                {price !== null ? (
                  <>
                    <span className="text-display-sm font-bold text-foreground">${price}</span>
                    <span className="text-body-sm text-muted">/mo</span>
                  </>
                ) : (
                  <span className="text-display-sm font-bold text-foreground">Free</span>
                )}
              </div>
              {plan !== 'listed' && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleCheckout(plan); }}
                  disabled={pending || isCurrent}
                  className={`w-full h-8 rounded-md text-caption font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${UPGRADE_BTN}`}
                >
                  {isCurrent ? 'Active' : 'Upgrade'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-caption text-muted mb-8">Have a promo code? You can enter it at checkout.</p>

      {/* Feature switches — reflect selected preview plan */}
      <div>
        <h3 className="text-heading-xs font-semibold text-foreground mb-4">
          Features
          {preview !== currentPlan && (
            <span className="ml-2 text-caption font-normal text-muted">
              (previewing {PLAN_LABEL[preview]})
            </span>
          )}
        </h3>
        <div className="space-y-3">
          {FEATURES.map((feat) => {
            const enabled = PLAN_FEATURES[preview].has(feat.key as FeatureKey);
            return (
              <div key={feat.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className={`text-body-sm font-medium ${enabled ? 'text-foreground' : 'text-muted'}`}>
                    {feat.label}
                  </p>
                  <p className="text-caption text-muted-light">{feat.description}</p>
                </div>
                {/* Read-only toggle — visual only */}
                <div
                  aria-checked={enabled}
                  role="switch"
                  aria-label={feat.label}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                    enabled ? 'bg-brand' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
