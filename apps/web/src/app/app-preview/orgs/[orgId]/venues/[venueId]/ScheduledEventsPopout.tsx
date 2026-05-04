'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import styles from './preview.module.css';

const EVENT_TYPE_LABELS: Record<string, string> = {
  event: 'Event',
  special: 'Special',
  live_music: 'Live Music',
  trivia: 'Trivia',
  sports: 'Sports',
  other: 'Other',
};

const RRULE_DAYS: Record<string, string> = {
  SU: 'Sun',
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
};

export type ScheduledPreviewEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  is_recurring: boolean | null;
  recurrence_rule: string | null;
  price_info: string | null;
  external_url: string | null;
  ticket_url: string | null;
};

function eventTypeLabel(type: string) {
  return EVENT_TYPE_LABELS[type] ?? type.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatEventTiming(event: ScheduledPreviewEvent) {
  const startsAt = new Date(event.starts_at);
  const startTime = formatTime(event.starts_at);
  const endTime = event.ends_at ? formatTime(event.ends_at) : null;
  const range = endTime ? `${startTime} - ${endTime}` : startTime;

  if (event.is_recurring) {
    const match = event.recurrence_rule?.match(/BYDAY=([A-Z,]+)/);
    const days = match?.[1]
      .split(',')
      .map((day) => RRULE_DAYS[day] ?? day)
      .filter(Boolean)
      .join(', ');

    return days ? `Every ${days} at ${range}` : `Recurring at ${range}`;
  }

  const date = startsAt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return `${date} at ${range}`;
}

export default function ScheduledEventsPopout({ events }: { events: ScheduledPreviewEvent[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.eventsLink} onClick={() => setIsOpen(true)}>
        scheduled events
      </button>

      {isOpen ? (
        <div className={styles.eventsBackdrop} role="presentation" onClick={() => setIsOpen(false)}>
          <section
            className={styles.eventsDialog}
            role="dialog"
            aria-modal="true"
            aria-label="Scheduled events"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.eventsDialogHeader}>
              <div>
                <div className={styles.eventsEyebrow}>Scheduled</div>
                <h2 className={styles.eventsTitle}>Events</h2>
              </div>
              <button type="button" className={styles.eventsClose} onClick={() => setIsOpen(false)} aria-label="Close scheduled events">
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            {events.length > 0 ? (
              <div className={styles.eventsList}>
                {events.map((event) => (
                  <article key={event.id} className={styles.eventCard}>
                    <div className={styles.eventCardHeader}>
                      <span className={styles.eventType}>{eventTypeLabel(event.event_type)}</span>
                      {event.price_info ? <span className={styles.eventPrice}>{event.price_info}</span> : null}
                    </div>
                    <h3 className={styles.eventTitle}>{event.title}</h3>
                    <p className={styles.eventTiming}>{formatEventTiming(event)}</p>
                    {event.description ? <p className={styles.eventDescription}>{event.description}</p> : null}
                    {(event.external_url || event.ticket_url) ? (
                      <div className={styles.eventLinks}>
                        {event.external_url ? (
                          <a href={event.external_url} className={styles.eventLink} target="_blank" rel="noreferrer">
                            More info
                          </a>
                        ) : null}
                        {event.ticket_url ? (
                          <a href={event.ticket_url} className={styles.eventLink} target="_blank" rel="noreferrer">
                            Tickets
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.eventsEmpty}>No scheduled events yet.</p>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
