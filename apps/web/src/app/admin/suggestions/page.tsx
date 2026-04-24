import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

type SuggestionMeta = {
  venue_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
};

type Suggestion = {
  id: string;
  user_id: string;
  created_at: string;
  meta: SuggestionMeta;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function SuggestionsPage() {
  const keyError = getServiceRoleKeyError();
  const supabase = keyError ? await createClient() : createServiceClient();

  const { data: raw, error } = await supabase
    .from('user_events')
    .select('id, user_id, created_at, meta')
    .eq('event_type', 'venue_suggestion')
    .order('created_at', { ascending: false })
    .limit(200);

  const suggestions: Suggestion[] = (raw ?? []).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    meta: r.meta as SuggestionMeta,
  }));

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Admin Console
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Incoming Suggestions</h1>
            <p className="text-body-sm text-muted mt-1">
              Venue suggestions submitted by users from the mobile app.
            </p>
          </div>
          <Link href="/admin">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Admin Console
            </span>
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Failed to load suggestions</p>
            <p className="text-body-sm text-error/80 mt-0.5">{error.message}</p>
          </div>
        )}

        {/* Count */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-heading-sm font-semibold text-foreground">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
          </span>
          {suggestions.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-brand-subtle px-2.5 py-0.5 text-caption font-medium text-brand-dark-alt">
              {suggestions.length} pending review
            </span>
          )}
        </div>

        {/* Empty state */}
        {suggestions.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
            <p className="text-body-md font-semibold text-foreground mb-1">No suggestions yet</p>
            <p className="text-body-sm text-muted">
              When users submit a venue suggestion from the mobile app it will appear here.
            </p>
          </div>
        )}

        {/* Table */}
        {suggestions.length > 0 && (
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Venue</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Address</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">City / State</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">Notes</th>
                  <th className="text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider">User ID</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border last:border-0 hover:bg-background transition-colors ${i % 2 === 1 ? 'bg-background/50' : ''}`}
                  >
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {s.meta?.venue_name ?? <span className="text-muted-light">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {s.meta?.address ?? <span className="text-muted-light">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {[s.meta?.city, s.meta?.state].filter(Boolean).join(', ') || <span className="text-muted-light">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-xs">
                      {s.meta?.notes
                        ? <span className="line-clamp-2">{s.meta.notes}</span>
                        : <span className="text-muted-light">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 font-mono text-caption text-muted-light">
                      {s.user_id.slice(0, 8)}…
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
