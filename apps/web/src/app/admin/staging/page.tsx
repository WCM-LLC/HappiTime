import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createServiceClient } from '@/utils/supabase/server';
import StagingTable from './StagingTable';

export default async function StagingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const rawPageSize = parseInt(sp.pageSize ?? '25', 10);
  const pageSize = [10, 25, 50].includes(rawPageSize) ? rawPageSize : 25;
  const q = sp.q?.trim() ?? '';
  const statusFilter = sp.status ?? 'pending';

  const supabase = createServiceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('staging_venues')
    .select(
      'id, external_ref, payload, status, source, created_at, rejection_reason, match_venue_id',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  if (q) {
    query = query.filter('payload->>name', 'ilike', `%${q}%`);
  }

  const { data: rows, count, error } = await query;

  const { data: orgsRaw } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .order('name', { ascending: true });

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
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
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Staging / Pending Review</h1>
            <p className="text-body-sm text-muted mt-1">
              Scraped venues awaiting review before promotion to the live venue list.
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
            <p className="text-body-sm font-medium text-error">Failed to load staging venues</p>
            <p className="text-body-sm text-error/80 mt-0.5">{error.message}</p>
          </div>
        )}

        <StagingTable
          rows={rows ?? []}
          total={count ?? 0}
          page={page}
          pageSize={pageSize}
          q={q}
          statusFilter={statusFilter}
          orgs={orgsRaw ?? []}
        />
      </main>
    </div>
  );
}
