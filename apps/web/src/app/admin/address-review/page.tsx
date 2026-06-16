import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { AddressReviewActions } from './AddressReviewActions';

type QueueRow = {
  venue_id: string;
  org_id: string | null;
  venue_name: string;
  venue_slug: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  places_id: string | null;
  stored_address: string | null;
  google_address: string | null;
  match_score: number | null;
  checked_at: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function scoreBadge(score: number | null) {
  const s = score ?? 0;
  const cls = s < 0.5
    ? 'bg-error-light text-error'
    : 'bg-brand-subtle text-brand-dark-alt';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${cls}`}>
      {score == null ? 'n/a' : score.toFixed(2)}
    </span>
  );
}

export default async function AddressReviewPage() {
  const keyError = getServiceRoleKeyError();
  const supabase = keyError ? await createClient() : createServiceClient();

  const { data: raw, error } = await supabase
    .from('v_address_review_queue')
    .select('*')
    .limit(200);

  const rows: QueueRow[] = (raw ?? []) as QueueRow[];

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">Dashboard</Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">Admin Console</Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Address Review</h1>
            <p className="text-body-sm text-muted mt-1">
              Venues whose stored address drifts from Google. Accept Google&apos;s address, or keep ours.
            </p>
          </div>
          <Link href="/admin">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Admin Console
            </span>
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Failed to load review queue</p>
            <p className="text-body-sm text-error/80 mt-0.5">{error.message}</p>
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <span className="text-heading-sm font-semibold text-foreground">
            {rows.length} venue{rows.length !== 1 ? 's' : ''} flagged
          </span>
        </div>

        {rows.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
            <p className="text-body-md font-semibold text-foreground mb-1">Nothing to review</p>
            <p className="text-body-sm text-muted">
              When the hourly validator finds an address mismatch it will appear here.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Venue</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Stored address</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Google address</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Checked</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.venue_id} className={`border-b border-border last:border-0 align-top ${i % 2 === 1 ? 'bg-background/50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {r.org_id ? (
                        <Link href={`/orgs/${r.org_id}/venues/${r.venue_id}?from=admin`} className="text-brand hover:underline">
                          {r.venue_name}
                        </Link>
                      ) : (
                        r.venue_name
                      )}
                      {r.places_id && (
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${r.places_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-caption text-muted-light hover:text-muted mt-0.5"
                        >
                          View on Google ↗
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-xs">
                      {r.stored_address ?? <span className="text-muted-light">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-xs">
                      {r.google_address ?? <span className="text-muted-light">— (place not found)</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{scoreBadge(r.match_score)}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDate(r.checked_at)}</td>
                    <td className="px-4 py-3">
                      <AddressReviewActions venueId={r.venue_id} googleAddress={r.google_address} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
