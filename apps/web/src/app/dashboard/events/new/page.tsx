import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createServiceClient } from '@/utils/supabase/server';
import { EventProposalForm, type VenueOption } from './EventProposalForm';
import { EVENT_ERRORS } from '../event-messages';

export default async function NewTastemakerEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const errorText = sp.error ? (EVENT_ERRORS[sp.error] ?? sp.error) : null;

  // Same venue set a super user's intake scan may target: published only.
  // Read with the service client so the list matches what the action accepts,
  // independent of whichever RLS view the caller happens to have.
  const db = createServiceClient();
  const { data } = (await db
    .from('venues')
    .select('id, name, city')
    .eq('status', 'published')
    .order('name', { ascending: true })
    .limit(1000)) as { data: VenueOption[] | null };
  const venues = data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <UserBar />
      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <span className="text-muted-light">/</span>
            <Link href="/dashboard/events" className="text-body-sm text-muted hover:text-foreground transition-colors">
              Events
            </Link>
            <span className="text-muted-light">/</span>
            <span className="text-body-sm text-foreground">New</span>
          </div>
          <h1 className="text-display-md font-bold text-foreground tracking-tight">Propose an event</h1>
          <p className="text-body-sm text-muted mt-1">
            Put your night on the venue&apos;s HappiTime listing. The venue signs off; you bring the room.
          </p>
        </div>

        {errorText && (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Couldn&apos;t send that</p>
            <p className="text-body-sm text-error/80 mt-0.5">{errorText}</p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm max-w-2xl">
          <EventProposalForm venues={venues} />
        </div>
      </main>
    </div>
  );
}
