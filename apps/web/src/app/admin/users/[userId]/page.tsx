/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import ConfirmDeleteForm from '@/components/ConfirmDeleteForm';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { revokeSuperUser } from '@/actions/admin-user-actions';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function statusBadge(status: string | null) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold';
  if (status === 'published') return `${base} bg-success-light text-success`;
  if (status === 'pending_review') return `${base} bg-warning-light text-warning`;
  if (status === 'archived') return `${base} bg-surface border border-border text-muted-light`;
  return `${base} bg-surface border border-border text-muted`;
}

export default async function AdminSuperUserDetailsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const keyError = getServiceRoleKeyError();

  if (keyError) {
    return (
      <div className="min-h-screen bg-background">
        <UserBar />
        <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
          <Link href="/admin/users" className="text-body-sm text-muted hover:text-foreground">
            Admin / Users
          </Link>
          <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mt-6">
            <p className="text-body-sm font-medium text-warning">Limited mode</p>
            <p className="text-body-sm text-warning/80 mt-0.5">
              Add <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">SUPABASE_SERVICE_ROLE_KEY</code> to view Super User details.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const db = createServiceClient();
  const { data: profile } = await db
    .from('user_profiles')
    .select('user_id, handle, display_name, avatar_url, role, auto_publish_enabled, created_at, is_public')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profile) notFound();

  const [{ data: authUser }, { data: guidesRaw }] = await Promise.all([
    (db as any).auth.admin.getUserById(userId),
    db
      .from('guides')
      .select('id, title, slug, status, city, neighborhood, tags, published_at, updated_at')
      .eq('author_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);

  const guides = (guidesRaw ?? []) as any[];
  const guideIds = guides.map((guide) => guide.id);
  const { data: submissionsRaw } = guideIds.length > 0
    ? await db
        .from('guide_submissions')
        .select('id, guide_id, submitted_by, submitted_at, reviewed_by, reviewed_at, decision, notes')
        .in('guide_id', guideIds)
        .order('submitted_at', { ascending: false })
        .limit(100)
    : { data: [] as any[] };

  const guideTitleById = new Map(guides.map((guide) => [guide.id, guide.title]));
  const reviewerIds = Array.from(
    new Set((submissionsRaw ?? []).map((row: any) => row.reviewed_by).filter(Boolean)),
  );
  const reviewerEmailById = new Map<string, string>();
  await Promise.all(
    reviewerIds.map(async (reviewerId) => {
      const { data } = await (db as any).auth.admin.getUserById(reviewerId);
      if (data?.user?.email) reviewerEmailById.set(reviewerId, data.user.email);
    }),
  );

  // Insider attribution — referral summary (always available once Phase 5 migrations applied)
  const { data: refSummaryRaw } = await (db as any)
    .from('super_user_referral_summary')
    .select('*')
    .eq('super_user_id', userId)
    .maybeSingle();
  const refSummary = refSummaryRaw as { referees: number; itinerary_saves: number } | null;

  // Traffic summary — guarded: view only exists once Phase 1 (PR #77) is merged
  let trafficSummary: { first_checkins_driven: number; venues_touched: number; redemptions_driven: number } | null = null;
  {
    const { data: t, error: tErr } = await (db as any)
      .from('super_user_traffic_summary')
      .select('*')
      .eq('super_user_id', userId)
      .maybeSingle();
    if (!tErr && t) trafficSummary = t as any;
  }

  const p = profile as any;
  const email = authUser?.user?.email ?? null;
  const publishedCount = guides.filter((guide) => guide.status === 'published').length;
  const pendingCount = guides.filter((guide) => guide.status === 'pending_review').length;

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Admin
              </Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin/users" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Users
              </Link>
              <span className="text-muted-light">/</span>
              <span className="text-body-sm text-foreground">{p.handle ? `@${p.handle}` : p.display_name ?? 'User'}</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">
              {p.handle ? `@${p.handle}` : p.display_name ?? 'Super User'}
            </h1>
            <p className="text-body-sm text-muted mt-1">{email ?? 'Email unavailable'}</p>
          </div>
          <Link href="/admin/users">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Users
            </span>
          </Link>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 mb-8">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="h-20 w-20 rounded-full bg-brand-subtle overflow-hidden flex items-center justify-center mb-4">
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-heading-lg font-bold text-brand-dark-alt">
                  {(p.display_name ?? p.handle ?? email ?? '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <dl className="space-y-3 text-body-sm">
              <div>
                <dt className="text-caption font-semibold uppercase tracking-wider text-muted">Display name</dt>
                <dd className="text-foreground">{p.display_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-caption font-semibold uppercase tracking-wider text-muted">Role</dt>
                <dd className="text-foreground">{p.role}</dd>
              </div>
              <div>
                <dt className="text-caption font-semibold uppercase tracking-wider text-muted">Auto-publish</dt>
                <dd className="text-foreground">{p.auto_publish_enabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
              <div>
                <dt className="text-caption font-semibold uppercase tracking-wider text-muted">Created</dt>
                <dd className="text-foreground">{formatDate(p.created_at)}</dd>
              </div>
            </dl>

            {p.role === 'super_user' ? (
              <ConfirmDeleteForm
                action={revokeSuperUser}
                message={`Remove Super User access for ${p.handle ? `@${p.handle}` : p.display_name ?? 'this user'}? Their published guides stay live, but they lose Super User tools and auto-publish.`}
                className="mt-5 pt-4 border-t border-border"
              >
                <input type="hidden" name="user_id" value={userId} />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center h-9 px-4 rounded-md border border-error bg-error-light text-body-sm font-medium text-error hover:bg-error hover:text-white transition-colors cursor-pointer"
                >
                  Remove Super User
                </button>
              </ConfirmDeleteForm>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted">Published</p>
              <p className="text-display-md font-bold text-foreground mt-2">{publishedCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted">Pending</p>
              <p className="text-display-md font-bold text-foreground mt-2">{pendingCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted">Total guides</p>
              <p className="text-display-md font-bold text-foreground mt-2">{guides.length}</p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-heading-sm font-semibold text-foreground mb-4">Insider Attribution</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted">Brought</p>
              <p className="text-display-md font-bold text-foreground mt-2">{refSummary?.referees ?? 0}</p>
              <p className="text-caption text-muted-light mt-0.5">referees</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted">Saves</p>
              <p className="text-display-md font-bold text-foreground mt-2">{refSummary?.itinerary_saves ?? 0}</p>
              <p className="text-caption text-muted-light mt-0.5">itinerary saves</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted">First check-ins</p>
              <p className="text-display-md font-bold text-foreground mt-2">
                {trafficSummary !== null ? trafficSummary.first_checkins_driven : '—'}
              </p>
              <p className="text-caption text-muted-light mt-0.5">driven by referees</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted">Venues</p>
              <p className="text-display-md font-bold text-foreground mt-2">
                {trafficSummary !== null ? trafficSummary.venues_touched : '—'}
              </p>
              <p className="text-caption text-muted-light mt-0.5">touched</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <p className="text-caption font-semibold uppercase tracking-wider text-muted">Redemptions</p>
              <p className="text-display-md font-bold text-foreground mt-2">
                {trafficSummary !== null ? trafficSummary.redemptions_driven : '—'}
              </p>
              <p className="text-caption text-muted-light mt-0.5">by referees</p>
            </div>
          </div>
          {trafficSummary === null && (
            <p className="text-caption text-muted-light mt-3">
              Per-venue breakdown and traffic data available once check-in data is live (Phase 1).
            </p>
          )}
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm font-semibold text-foreground">Guides</h2>
            <Link href={`/admin/guides?author=${userId}`} className="text-body-sm font-medium text-brand hover:underline">
              View in queue
            </Link>
          </div>
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            {guides.length === 0 ? (
              <p className="text-body-sm text-muted p-5">No guides yet.</p>
            ) : (
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Title</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Updated</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {guides.map((guide) => (
                    <tr key={guide.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{guide.title}</span>
                        <span className="block text-caption text-muted-light">{guide.slug}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={statusBadge(guide.status)}>{guide.status}</span>
                      </td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell">{formatDate(guide.updated_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/guides/${guide.id}/edit`} className="text-caption font-medium text-brand hover:underline mr-3">
                          Edit
                        </Link>
                        <Link href={`/admin/guides/${guide.id}/preview`} className="text-caption font-medium text-brand hover:underline">
                          Preview
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-heading-sm font-semibold text-foreground mb-4">Submission Audit</h2>
          <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
            {(submissionsRaw ?? []).length === 0 ? (
              <p className="text-body-sm text-muted p-5">No submission history yet.</p>
            ) : (
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Guide</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Decision</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Submitted</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Reviewed</th>
                    <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Reviewer</th>
                  </tr>
                </thead>
                <tbody>
                  {(submissionsRaw ?? []).map((row: any) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {guideTitleById.get(row.guide_id) ?? row.guide_id}
                        {row.notes ? <span className="block text-caption text-muted mt-0.5">{row.notes}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-muted">{row.decision ?? 'submitted'}</td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell">{formatDate(row.submitted_at)}</td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell">{formatDate(row.reviewed_at)}</td>
                      <td className="px-4 py-3 text-muted hidden lg:table-cell">
                        {row.reviewed_by ? reviewerEmailById.get(row.reviewed_by) ?? row.reviewed_by : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
