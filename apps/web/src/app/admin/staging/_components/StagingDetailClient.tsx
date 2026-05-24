'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PromoteForm, RejectForm, type OrgOption } from './StagingActions';
import { adminUpdateStagingPayload } from '@/actions/admin-staging-actions';

type EditableFields = {
  name: string;
  city: string;
  state: string;
  zip: string;
  address: string;
  phone: string;
  website: string;
  instagram_url: string;
  facebook_url: string;
  tiktok_url: string;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function initFields(payload: Record<string, unknown>): EditableFields {
  return {
    name: str(payload.name) || str(payload.title),
    city: str(payload.city),
    state: str(payload.state),
    zip: str(payload.zip),
    address: str(payload.address),
    phone: str(payload.phone) || str(payload.phoneNumber),
    website: str(payload.website),
    instagram_url: str(payload.instagram_url),
    facebook_url: str(payload.facebook_url),
    tiktok_url: str(payload.tiktok_url),
  };
}

const EDITABLE_FIELDS: { key: keyof EditableFields; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true },
  { key: 'zip', label: 'Zip', required: true },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'instagram_url', label: 'Instagram URL' },
  { key: 'facebook_url', label: 'Facebook URL' },
  { key: 'tiktok_url', label: 'TikTok URL' },
];

export default function StagingDetailClient({
  rowId,
  hasNoExternalRef,
  orgs,
  payload,
}: {
  rowId: string;
  hasNoExternalRef: boolean;
  orgs: OrgOption[];
  payload: Record<string, unknown>;
}) {
  const router = useRouter();

  const [action, setAction] = useState<'promote' | 'reject' | null>(null);
  const [actionToast, setActionToast] = useState('');

  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<EditableFields>(() => initFields(payload));
  const [editErr, setEditErr] = useState('');
  const [isSaving, startSaveTransition] = useTransition();

  const missingRequired = EDITABLE_FIELDS.filter((f) => f.required && !fields[f.key]).map((f) => f.label);

  function handleActionDone(msg: string) {
    setAction(null);
    setActionToast(msg);
    router.refresh();
  }

  function handleSave() {
    setEditErr('');
    startSaveTransition(async () => {
      try {
        await adminUpdateStagingPayload(rowId, fields);
        setEditing(false);
        router.refresh();
      } catch (e: unknown) {
        setEditErr(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  function handleCancelEdit() {
    setEditing(false);
    setEditErr('');
    setFields(initFields(payload));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Actions */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-heading-sm font-semibold text-foreground mb-4">Review Actions</h2>

        {actionToast && (
          <p className="text-body-sm text-success font-medium mb-3">{actionToast}</p>
        )}

        {missingRequired.length > 0 && (
          <p className="text-caption text-[#92400E] bg-[#FEF3C7] px-3 py-2 rounded mb-3">
            Missing required fields: <strong>{missingRequired.join(', ')}</strong> — edit below before promoting.
          </p>
        )}

        {action === null ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAction('promote')}
              className="h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
            >
              Promote
            </button>
            <button
              type="button"
              onClick={() => setAction('reject')}
              className="h-9 px-4 rounded-md border border-error text-error text-body-sm font-medium hover:bg-error hover:text-white transition-colors cursor-pointer"
            >
              Reject
            </button>
          </div>
        ) : (
          <div className="mt-1">
            {action === 'promote' && (
              <PromoteForm
                rowId={rowId}
                orgs={orgs}
                hasNoExternalRef={hasNoExternalRef}
                onDone={handleActionDone}
                onCancel={() => setAction(null)}
              />
            )}
            {action === 'reject' && (
              <RejectForm
                rowId={rowId}
                onDone={handleActionDone}
                onCancel={() => setAction(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Edit payload fields */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-heading-sm font-semibold text-foreground">Edit Fields</h2>
            <p className="text-caption text-muted mt-0.5">Fix missing or incorrect data before promoting.</p>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {EDITABLE_FIELDS.map(({ key, label, required }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-caption font-semibold text-muted uppercase tracking-wider">
                    {label}
                    {required && <span className="text-error ml-0.5">*</span>}
                  </label>
                  <input
                    value={fields[key]}
                    onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                    className="h-8 w-full rounded border border-border bg-background text-body-sm px-2 focus:ring-1 focus:ring-brand focus:outline-none"
                  />
                </div>
              ))}
            </div>

            {editErr && <p className="text-caption text-error">{editErr}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="h-8 px-4 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="h-8 px-4 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {EDITABLE_FIELDS.map(({ key, label, required }) => (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="text-caption font-semibold text-muted uppercase tracking-wider">
                  {label}
                  {required && !fields[key] && (
                    <span className="ml-1 text-error">missing</span>
                  )}
                </span>
                {fields[key] ? (
                  <span className="text-body-sm text-foreground break-words">{fields[key]}</span>
                ) : (
                  <span className="text-body-sm text-muted-light">—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
