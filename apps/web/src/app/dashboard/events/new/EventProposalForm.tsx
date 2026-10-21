'use client';

import { useState } from 'react';
import { submitTastemakerEvent } from '@/actions/tastemaker-event-actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DOW, EVENT_TYPE_LABELS } from '../event-messages';

const inputCls =
  'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';
const labelCls = 'text-body-sm font-medium text-foreground block mb-1.5';

export type VenueOption = { id: string; name: string; city: string | null };

export function EventProposalForm({ venues }: { venues: VenueOption[] }) {
  const [weekly, setWeekly] = useState(false);

  return (
    <form action={submitTastemakerEvent} className="flex flex-col gap-5">
      <div>
        <label htmlFor="venue_id" className={labelCls}>Venue</label>
        <select id="venue_id" name="venue_id" required className={inputCls} defaultValue="">
          <option value="" disabled>Pick the venue…</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}{v.city ? ` — ${v.city}` : ''}
            </option>
          ))}
        </select>
        <p className="text-caption text-muted mt-1">Only published venues are listed. Don&apos;t see yours? Tell Juan and it gets added first.</p>
      </div>

      <div>
        <label htmlFor="title" className={labelCls}>Event title</label>
        <input id="title" name="title" required maxLength={120} className={inputCls} placeholder="First Friday: KC Business Besties" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="event_type" className={labelCls}>Type</label>
          <select id="event_type" name="event_type" className={inputCls} defaultValue="event">
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="price_info" className={labelCls}>Cover / price <span className="text-muted font-normal">(optional)</span></label>
          <input id="price_info" name="price_info" maxLength={80} className={inputCls} placeholder="Free · $5 cover · $10–$25" />
        </div>
      </div>

      <fieldset className="rounded-md border border-border p-4">
        <legend className="text-body-sm font-medium text-foreground px-1">When</legend>
        <div className="flex items-center gap-6 mb-4">
          <label className="inline-flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
            <input type="radio" name="_mode" checked={!weekly} onChange={() => setWeekly(false)} className="accent-brand" />
            One date
          </label>
          <label className="inline-flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
            <input type="radio" name="_mode" checked={weekly} onChange={() => setWeekly(true)} className="accent-brand" />
            Every week
          </label>
          {/* The server reads this; the radios above are only UI. */}
          <input type="hidden" name="is_recurring" value={weekly ? 'on' : ''} />
        </div>

        {weekly ? (
          <div className="mb-4">
            <span className={labelCls}>Days</span>
            <div className="flex flex-wrap gap-2">
              {DOW.map((d) => (
                <label key={d.value} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 h-10 text-body-sm text-foreground cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand-subtle">
                  <input type="checkbox" name="dow" value={d.value} className="accent-brand" />
                  {d.label}
                </label>
              ))}
            </div>
            <p className="text-caption text-muted mt-1">The first occurrence is placed on the next matching day.</p>
          </div>
        ) : (
          <div className="mb-4 max-w-xs">
            <label htmlFor="date" className={labelCls}>Date</label>
            <input id="date" name="date" type="date" required={!weekly} className={inputCls} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div>
            <label htmlFor="start_time" className={labelCls}>Starts</label>
            <input id="start_time" name="start_time" type="time" required className={inputCls} />
          </div>
          <div>
            <label htmlFor="end_time" className={labelCls}>Ends <span className="text-muted font-normal">(optional)</span></label>
            <input id="end_time" name="end_time" type="time" className={inputCls} />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="description" className={labelCls}>Details <span className="text-muted font-normal">(optional)</span></label>
        <textarea id="description" name="description" rows={4} maxLength={2000} className={`${inputCls} h-auto`} placeholder="What's happening, who it's for, anything people should know before they show up." />
      </div>

      <div>
        <label htmlFor="external_url" className={labelCls}>Link <span className="text-muted font-normal">(optional — Eventbrite, Instagram post, RSVP)</span></label>
        <input id="external_url" name="external_url" type="url" inputMode="url" className={inputCls} placeholder="https://" />
      </div>

      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-caption text-muted">
          Goes to the venue for approval (or to HappiTime staff if the venue has no owner on the platform yet). Live the moment it&apos;s approved.
        </p>
        <SubmitButton
          pendingLabel="Sending…"
          className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-dark text-body-sm font-medium hover:bg-brand-hover transition-colors cursor-pointer whitespace-nowrap"
        >
          Send for approval
        </SubmitButton>
      </div>
    </form>
  );
}
