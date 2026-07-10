'use client';

import { useState } from 'react';
import { REWARD_PRESETS } from '@happitime/shared-types';
import { saveVenueReward } from '@/actions/reward-actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * Owner-facing card to pick a preset reward and advertise it. Writes
 * venues.reward_preset + reward_active via the saveVenueReward server action.
 * The chosen preset flows to the directory badge, venue banner, and the mobile
 * check-in/redemption screens. Read-only viewers never see this tab.
 */
export default function RewardConfig({
  orgId,
  venueId,
  initialPreset,
  initialActive,
}: {
  orgId: string;
  venueId: string;
  initialPreset: string | null;
  initialActive: boolean;
}) {
  const [preset, setPreset] = useState<string | null>(initialPreset);
  const [active, setActive] = useState<boolean>(initialActive);
  const label = REWARD_PRESETS.find((p) => p.key === preset)?.label ?? null;

  return (
    <form action={saveVenueReward} className="rounded-lg border border-border bg-surface p-6 shadow-sm max-w-xl">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="venue_id" value={venueId} />
      <input type="hidden" name="reward_preset" value={preset ?? ''} />

      <div className="mb-5">
        <h2 className="text-heading-sm font-semibold text-foreground">Redeemable reward</h2>
        <p className="text-body-sm text-muted mt-0.5">Guests earn it after 5 check-ins. You choose what it is.</p>
      </div>

      <label className="text-body-sm font-medium text-foreground block mb-2">What guests earn</label>
      <div className="flex flex-wrap gap-2 mb-5">
        {REWARD_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(preset === p.key ? null : p.key)}
            aria-pressed={preset === p.key}
            className={`text-body-sm font-medium px-3.5 py-2 rounded-full border transition-colors cursor-pointer ${
              preset === p.key
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-border text-muted hover:border-brand hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3.5 mb-5 cursor-pointer">
        <span>
          <span className="block text-body-sm font-semibold text-foreground">Advertise this reward</span>
          <span className="text-caption text-muted">Shown on your listing and in-app while active</span>
        </span>
        <input
          type="checkbox"
          name="reward_active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-5 w-5 cursor-pointer accent-brand"
        />
      </label>

      <div className="rounded-xl border border-brand/30 bg-brand-subtle px-4 py-3 mb-5">
        <span className="text-caption font-semibold uppercase tracking-wider text-brand-dark-alt">Guest preview</span>
        <p className="text-body-sm font-semibold text-foreground mt-1">
          {label && active
            ? `Check in 5 times — the house buys you ${label.toLowerCase()}.`
            : 'No reward advertised yet.'}
        </p>
      </div>

      <SubmitButton
        className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
        pendingLabel="Saving…"
      >
        Save reward
      </SubmitButton>
    </form>
  );
}
