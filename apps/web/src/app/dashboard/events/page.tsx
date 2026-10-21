import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { EVENTS_PATH } from '@/utils/auth-paths';
import { EVENT_NOTICE, EVENT_TYPE_LABELS } from './event-messages';

type EventRow = {
  id: string;
  venue_id: string;
  title: string;
  event_type: string;
  status: string;
  starts_at: string;
  is_recurring: boolean;
  recurrence_rule: string | null;
  created_at: string;
};

type SubmissionRow = { id: string; status: string; reject_reason: string | null; review_route: string };

function reviewLabel(ev: EventRow, sub: SubmissionRow | undefined): { text: string; cls: string } {
  if (ev.status === 'published') return { text: 'Live', cls: 'bg-success-light text-success-ink' };
  if (ev.status === 'archived' || ev.status === 'canceled') return { text: ev.status === 'archived' ? 'Ended' : 'Canceled', cls: 'bg-background text-muted border border-border' };
  if (!sub) return { text: 'Draft', cls: 'bg-background text-muted border border-border' };
  if (sub.status === 'rejected') return { text: 'Not approved', cls: 'bg-error-light text-error' };
  if (sub.status === 'approved') return { text: 'Approved', cls: 'bg-success-light text-success-ink' };
  return {
    text: sub.review_route === 'owner' ? 'Waiting on the venue' : 'Waiting on HappiTime',
    cls: 'bg-warning-light text-warning-ink',
  };
}

function whenLabel(ev: EventRow): string {
  if (ev.is_recurring && ev.recurrence_rule) {
    const m = /BYDAY=([A-Z,]+)/.exec(ev.recurrence_rule);
    const names: Record<string, string> = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
    const days = (m?.[1] ?? '').split(',').filter(Boolean).map((d) => names[d] ?? d);
    return `Weekly · ${days.join(', ')} · ${ev.starts_at.slice(11, 16)}`;
  }
  // starts_at is a naive local wall-clock string (YYYY-MM-DDTHH:MM); show it as written.
  const [d, t] = ev.starts_at.split('T');
  return `${d} · ${(t ?? '').slice(0, 5)}`;
}

export default async function TastemakerEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/super-user/login');

  // Drafts are invisible to their author under RLS (venue_events select is
  // published-or-member), so this page reads with the service client, filtered
  // hard to the caller's own rows — the same pattern /dashboard/referrals uses.
  const db = createServiceClient();
  const { data: events } = (await db
    .from('venue_events')
    .select('id, venue_id, title, event_type, status, starts_at, is_recurring, recurrence_rule, created_at')
    .eq('created_by', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100)) as { data: EventRow[] | null };
  const rows = events ?? [];

  const venueIds = [...new Set(rows.map((r) => r.venue_id))];
  const { data: venues } = venueIds.length
    ? ((await db.from('venues').select('id, name').in('id', venueIds)) as { data: Array<{ id: string; name: string }> | null })
    : { data: [] };
  const venueName = new Map((venues ?? []).map((v) => [v.id, v.name]));

  const eventIds = rows.map((r) => r.id);
  const subByEvent = new Map<string, SubmissionRow>();
  if (eventIds.length) {
    const { data: links } = (await db
      .from('intake_submission_events')
      .select('event_id, submission_id')
      .in('event_id', eventIds)) as { data: Array<{ event_id: string; submission_id: string }> | null };
    const subIds = [...new Set((links ?? []).map((l) => l.submission_id))];
    if (subIds.length) {
      const { data: subs } = (await db
        .from('intake_submissions')
        .select('id, status, reject_reason, review_route')
        .in('id', subIds)) as { data: SubmissionRow[] | null };
      const subById = new Map((subs ?? []).map((s) => [s.id, s]));
      for (const l of links ?? []) {
        const s = subById.get(l.submission_id);
        if (s) subByEvent.set(l.event_id, s);
      }
    }
  }

  const noticeText = sp.notice ? (EVENT_NOTICE[sp.notice] ?? null) : null;

  return (
    <div className="min-h-screen bg-background">
      <UserBar />
      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span className="text-muted-light">/</span>
              <span className="text-body-sm text-foreground">Events</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Your events</h1>
            <p className="text-body-sm text-muted mt-1">
              Propose a night at any venue on HappiTime. The venue approves it and it goes live on their listing.
            </p>
          </div>
          <Link
            href={`${EVENTS_PATH}/new`}
            className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-dark text-body-sm font-medium hover:bg-brand-hover transition-colors whitespace-nowrap"
          >
            Propose an event
          </Link>
        </div>

        {noticeText && (
          <div className="rounded-md border border-brand bg-brand-subtle px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-brand-dark">{noticeText}</p>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-10 text-center">
            <p className="text-body-md font-medium text-foreground">No events yet.</p>
            <p className="text-body-sm text-muted mt-1">
              Hosting something? Put it on the venue&apos;s HappiTime listing so people can find it.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <table className="w-full text-body-sm">
              <thead className="bg-background text-muted text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 font-medium">Venue</th>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ev) => {
                  const sub = subByEvent.get(ev.id);
                  const badge = reviewLabel(ev, sub);
                  return (
                    <tr key={ev.id} className="border-t border-border align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{ev.title}</div>
                        <div className="text-muted">{EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}</div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{venueName.get(ev.venue_id) ?? '—'}</td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">{whenLabel(ev)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-caption font-medium ${badge.cls}`}>
                          {badge.text}
                        </span>
                        {sub?.status === 'rejected' && sub.reject_reason && (
                          <div className="text-muted mt-1">{sub.reject_reason}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
