'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { saveDraft, submitGuide } from '@/actions/guide-actions';

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
  const canSubmit = showSubmit && status === 'draft';

  return (
    <div>
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

      <form>
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

          {/* Cover image URL */}
          <div>
            <label htmlFor="guide-cover" className="text-body-sm font-medium text-foreground block mb-1.5">
              Cover image URL <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="guide-cover"
              name="cover_image_url"
              type="url"
              defaultValue={initialCoverUrl}
              placeholder="https://…"
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
            />
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
              onChange={(v) => setBodyMd(v ?? '')}
              height={480}
              preview="edit"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            formAction={saveAction}
            className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
          >
            {saveLabel}
          </button>
          {canSubmit ? (
            <button
              formAction={submitAction}
              className="inline-flex items-center justify-center h-10 px-5 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer"
            >
              {submitLabel}
            </button>
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
