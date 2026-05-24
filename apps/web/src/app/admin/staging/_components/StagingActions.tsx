'use client';

import { useState, useTransition } from 'react';
import { adminPromoteStagingVenue, adminRejectStagingVenue } from '@/actions/admin-staging-actions';

export type OrgOption = { id: string; name: string; slug: string };

export function PromoteForm({
  rowId,
  orgs,
  hasNoExternalRef,
  onDone,
  onCancel,
}: {
  rowId: string;
  orgs: OrgOption[];
  hasNoExternalRef: boolean;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  function submit() {
    if (!orgId) { setErr('Select an organization'); return; }
    setErr('');
    startTransition(async () => {
      try {
        const result = await adminPromoteStagingVenue(rowId, orgId);
        onDone(result.alreadyExisted ? 'Linked to existing venue (duplicate places_id).' : 'Venue promoted successfully.');
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Promotion failed');
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 min-w-[220px]">
      {hasNoExternalRef && (
        <p className="text-caption text-[#92400E] bg-[#FEF3C7] px-2 py-1 rounded">
          No places_id — photo sync won&apos;t auto-run
        </p>
      )}
      <select
        value={orgId}
        onChange={(e) => setOrgId(e.target.value)}
        className="h-8 rounded border border-border bg-background text-body-sm px-2 focus:ring-1 focus:ring-brand focus:outline-none"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      {err && <p className="text-caption text-error">{err}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isPending ? 'Promoting…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function RejectForm({
  rowId,
  onDone,
  onCancel,
}: {
  rowId: string;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  function submit() {
    setErr('');
    startTransition(async () => {
      try {
        await adminRejectStagingVenue(rowId, reason || undefined);
        onDone('Venue rejected.');
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Rejection failed');
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 min-w-[220px]">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="h-8 rounded border border-border bg-background text-body-sm px-2 placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
      />
      {err && <p className="text-caption text-error">{err}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="h-7 px-3 rounded bg-error text-white text-caption font-medium hover:opacity-80 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isPending ? 'Rejecting…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
