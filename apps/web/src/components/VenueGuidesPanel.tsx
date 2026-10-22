import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDate, fmtInt } from '@/components/metrics/format';

type Row = {
  guide_id: string;
  slug: string;
  title: string;
  author_handle: string | null;
  author_name: string | null;
  venue_clicks: number;
  people_sent: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

/**
 * "Guides sending you people" — the Tastemaker guides that link this venue and
 * what they did for it in the last 28 days. Read through venue_guide_stats(),
 * which checks org membership itself, so this must be called with the signed-in
 * user's client (not the service client).
 */
export default async function VenueGuidesPanel({ supabase, venueId, venueName }: { supabase: SupabaseClient; venueId: string; venueName: string }) {
  const { data, error } = await supabase.rpc('venue_guide_stats', { p_venue_id: venueId, p_days: 28 });
  const rows = (Array.isArray(data) ? data : []) as Row[];
  const sent = rows.reduce((n, r) => n + r.people_sent, 0);
  const clicks = rows.reduce((n, r) => n + r.venue_clicks, 0);

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
      <div className="mb-5">
        <h2 className="text-heading-sm font-semibold text-foreground">Guides sending you people</h2>
        <p className="text-body-sm text-muted mt-0.5">
          {rows.length
            ? `${rows.length} Tastemaker guide${rows.length === 1 ? '' : 's'} sent ${fmtInt(sent)} ${sent === 1 ? 'person' : 'people'} and ${fmtInt(clicks)} click${clicks === 1 ? '' : 's'} to ${venueName} in the last 28 days.`
            : `No Tastemaker guide links ${venueName} yet. When one does, its reads and the check-ins it sends show here.`}
        </p>
      </div>

      {error ? (
        <p className="text-body-sm text-error">{error.message}</p>
      ) : rows.length ? (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left text-caption font-medium text-muted px-4 py-2.5">Guide</th>
                <th className="text-left text-caption font-medium text-muted px-4 py-2.5">Author</th>
                <th className="text-right text-caption font-medium text-muted px-4 py-2.5">Clicks</th>
                <th className="text-right text-caption font-medium text-muted px-4 py-2.5">People sent</th>
                <th className="text-right text-caption font-medium text-muted px-4 py-2.5 hidden sm:table-cell">Last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.guide_id} className={`border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-background/50'}`}>
                  <td className="text-body-sm text-foreground font-medium px-4 py-2.5">
                    <a href={`https://www.happitime.biz/guides/${r.slug}/`} target="_blank" rel="noreferrer" className="hover:underline">{r.title}</a>
                  </td>
                  <td className="text-body-sm text-muted px-4 py-2.5">{r.author_handle ? `@${r.author_handle}` : r.author_name ?? 'HappiTime'}</td>
                  <td className="text-body-sm text-muted text-right tabular-nums px-4 py-2.5">{fmtInt(r.venue_clicks)}</td>
                  <td className="text-body-sm text-foreground font-semibold text-right tabular-nums px-4 py-2.5">{fmtInt(r.people_sent)}</td>
                  <td className="text-body-sm text-muted text-right px-4 py-2.5 hidden sm:table-cell">{r.last_seen_at ? fmtDate(r.last_seen_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
