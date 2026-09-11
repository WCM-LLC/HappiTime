'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { saveDraft, submitGuide } from '@/actions/guide-actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  backupKey,
  buildBackup,
  classifyBackup,
  type GuideBackup,
} from '@/utils/guideDraftBackup.mjs';

// SSR must be disabled — @uiw/react-md-editor uses window on init.
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[400px] rounded-md border border-border bg-surface animate-pulse" />
  ),
});

export type GuideEditorProps = {
  id?: string;
  initialTitle?: string;
  initialSubtitle?: string;
  initialBodyMd?: string;
  initialCity?: string;
  initialNeighborhood?: string;
  initialTags?: string;
  initialCoverUrl?: string;
  status?: string;
  noticeText?: string | null;
  errorText?: string | null;
  saveAction?: (formData: FormData) => void | Promise<void>;
  submitAction?: (formData: FormData) => void | Promise<void>;
  saveLabel?: string;
  submitLabel?: string;
  showSubmit?: boolean;
};

export function GuideEditor({
  id,
  initialTitle = '',
  initialSubtitle = '',
  initialBodyMd = '',
  initialCity = '',
  initialNeighborhood = '',
  initialTags = '',
  initialCoverUrl = '',
  status = 'draft',
  noticeText,
  errorText,
  saveAction = saveDraft,
  submitAction = submitGuide,
  saveLabel = 'Save draft',
  submitLabel = 'Submit for review',
  showSubmit = true,
}: GuideEditorProps) {
  const [bodyMd, setBodyMd] = useState(initialBodyMd);
  const [pendingBackup, setPendingBackup] = useState<GuideBackup | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Ref mirror of bodyMd: schedulePersist's timeout would otherwise capture a
  // stale render's state and persist one edit behind.
  const bodyRef = useRef(initialBodyMd);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = backupKey(id ?? null);
  // Submit posts the draft's id; before the first save there is no row, so the
  // action could only fail (missing_guide_id) and dump the author on the list.
  const canSubmit = showSubmit && status === 'draft' && Boolean(id);

  // The form is the only holder of the author's text until a save succeeds —
  // any server-action redirect (validation, expired session) unmounts it. Keep
  // a localStorage copy so nothing typed is ever lost.
  const readFields = (): Record<string, string> => {
    const form = formRef.current;
    const value = (name: string) =>
      (form?.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
    return {
      title: value('title'),
      subtitle: value('subtitle'),
      city: value('city'),
      neighborhood: value('neighborhood'),
      tags: value('tags'),
      cover_image_url: value('cover_image_url'),
      body_md: bodyRef.current,
    };
  };

  const schedulePersist = () => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(buildBackup(readFields(), Date.now())));
      } catch {
        // Quota/private-mode failures must never break typing.
      }
    }, 500);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const backup = raw ? (JSON.parse(raw) as GuideBackup) : null;
      const kind = classifyBackup(backup, initialBodyMd);
      if (kind === 'stale') localStorage.removeItem(key);
      if (kind === 'restorable') setPendingBackup(backup);
      if (id) {
        // A successful first save moves the author from /new to this page;
        // clear the now-persisted 'new' backup so it isn't offered later.
        const newKey = backupKey(null);
        const rawNew = localStorage.getItem(newKey);
        const newBackup = rawNew ? (JSON.parse(rawNew) as GuideBackup) : null;
        if (classifyBackup(newBackup, initialBodyMd) !== 'restorable') {
          localStorage.removeItem(newKey);
        }
      }
    } catch {
      // Malformed storage — start fresh.
    }
    return () => clearTimeout(persistTimer.current);
    // Mount-only: the key and initial body are fixed for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreBackup = () => {
    if (!pendingBackup) return;
    const form = formRef.current;
    for (const [name, val] of Object.entries(pendingBackup.fields)) {
      if (name === 'body_md') continue;
      const el = form?.elements.namedItem(name) as HTMLInputElement | null;
      if (el) el.value = val;
    }
    bodyRef.current = pendingBackup.fields.body_md ?? '';
    setBodyMd(pendingBackup.fields.body_md ?? '');
    setPendingBackup(null);
  };

  const discardBackup = () => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setPendingBackup(null);
  };

  return (
    <div>
      {pendingBackup ? (
        <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm font-medium text-warning">
            You have unsaved writing from {new Date(pendingBackup.savedAt).toLocaleString()}
            {pendingBackup.fields.title ? ` — “${pendingBackup.fields.title}”` : ''}. Restore it?
          </p>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={restoreBackup}
              className="h-8 px-3 rounded-md bg-brand text-white text-caption font-semibold hover:bg-brand-dark transition-colors cursor-pointer"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={discardBackup}
              className="h-8 px-3 rounded-md border border-border bg-surface text-caption font-medium text-foreground hover:bg-background transition-colors cursor-pointer"
            >
              Discard
            </button>
          </span>
        </div>
      ) : null}

      {noticeText ? (
        <div className="rounded-md border border-success bg-success-light px-4 py-3 mb-6">
          <p className="text-body-sm font-medium text-success">{noticeText}</p>
        </div>
      ) : null}

      {errorText ? (
        <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
          <p className="text-body-sm font-medium text-error">{errorText}</p>
        </div>
      ) : null}

      <form ref={formRef} onInput={schedulePersist}>
        {id ? <input type="hidden" name="id" value={id} /> : null}
        <input type="hidden" name="body_md" value={bodyMd} />

        <div className="grid grid-cols-1 gap-5 mb-6">
          {/* Title */}
          <div>
            <label htmlFor="guide-title" className="text-body-sm font-medium text-foreground block mb-1.5">
              Title <span className="text-error">*</span>
            </label>
            <input
              id="guide-title"
              name="title"
              required
              defaultValue={initialTitle}
              placeholder="e.g., Best Happy Hours in Crossroads"
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
            />
          </div>

          {/* Subtitle */}
          <div>
            <label htmlFor="guide-subtitle" className="text-body-sm font-medium text-foreground block mb-1.5">
              Subtitle <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="guide-subtitle"
              name="subtitle"
              defaultValue={initialSubtitle}
              placeholder="A short description shown in listings"
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* City */}
            <div>
              <label htmlFor="guide-city" className="text-body-sm font-medium text-foreground block mb-1.5">
                City
              </label>
              <input
                id="guide-city"
                name="city"
                defaultValue={initialCity}
                placeholder="Kansas City"
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
              />
            </div>

            {/* Neighborhood */}
            <div>
              <label htmlFor="guide-neighborhood" className="text-body-sm font-medium text-foreground block mb-1.5">
                Neighborhood
              </label>
              <input
                id="guide-neighborhood"
                name="neighborhood"
                defaultValue={initialNeighborhood}
                placeholder="Crossroads"
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
              />
            </div>

            {/* Tags */}
            <div>
              <label htmlFor="guide-tags" className="text-body-sm font-medium text-foreground block mb-1.5">
                Tags <span className="text-muted font-normal">(comma-separated)</span>
              </label>
              <input
                id="guide-tags"
                name="tags"
                defaultValue={initialTags}
                placeholder="happy hours, cocktails, date night"
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
              />
            </div>
          </div>

          {/* Cover image */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="guide-cover" className="text-body-sm font-medium text-foreground block mb-1.5">
                Cover image link <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                id="guide-cover"
                name="cover_image_url"
                type="url"
                defaultValue={initialCoverUrl}
                placeholder="https://images.example.com/photo.jpg"
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
              />
            </div>
            <div>
              <label htmlFor="guide-cover-file" className="text-body-sm font-medium text-foreground block mb-1.5">
                Upload cover image <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                id="guide-cover-file"
                name="cover_image_file"
                type="file"
                accept="image/avif,image/webp,image/jpeg,image/png"
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-brand-subtle file:px-3 file:py-1 file:text-caption file:font-semibold file:text-brand-dark-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Markdown body */}
        <div className="mb-6">
          <label className="text-body-sm font-medium text-foreground block mb-1.5">
            Body <span className="text-error">*</span>
          </label>
          <div data-color-mode="light">
            <MDEditor
              value={bodyMd}
              onChange={(v) => {
                bodyRef.current = v ?? '';
                setBodyMd(v ?? '');
                schedulePersist();
              }}
              height={480}
              preview="edit"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <SubmitButton
            formAction={saveAction}
            pendingLabel="Saving…"
            className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saveLabel}
          </SubmitButton>
          {canSubmit ? (
            <SubmitButton
              formAction={submitAction}
              pendingLabel="Submitting…"
              className="inline-flex items-center justify-center h-10 px-5 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitLabel}
            </SubmitButton>
          ) : (
            <span className="text-body-sm text-muted">
              Status: <span className="font-medium text-foreground capitalize">{status.replace('_', ' ')}</span>
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
