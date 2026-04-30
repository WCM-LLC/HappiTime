import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import {
  adminUpsertVenueSubscription,
  adminUpsertUserPlan,
  adminDeleteVenueSubscription,
  adminDeleteUserPlan,
} from '@/actions/admin-plans-actions';

type VenueSubscriptionRow = {
  id: string;
  venue_id: string;
  venue_name: string;
  plan: string;
  status: string;
  created_at: string;
};

type UserPlanRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  plan: string;
  status: string;
  created_at: string;
};

type VenueOption = { id: string; name: string; org_name: string | null };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const thCls = 'text-left px-4 py-3 text-caption font-semibold text-muted uppercase tracking-wider';
const tdCls = 'px-4 py-3';

const PLAN_BADGE: Record<string, string> = {
  listed:   'bg-surface text-muted border border-border',
  basic:    'bg-brand-subtle text-brand-dark-alt',
  featured: 'bg-amber-50 text-amber-700',
  premium:  'bg-violet-50 text-violet-700',
  // legacy names kept for existing rows
  free:     'bg-surface text-muted border border-border',
  pro:      'bg-brand-subtle text-brand-dark-alt',
  business: 'bg-amber-50 text-amber-700',
  power:    'bg-violet-50 text-violet-700',
};

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-green-50 text-green-700',
  inactive: 'bg-surface text-muted border border-border',
  trial:    'bg-blue-50 text-blue-700',
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default async function PlansPage() {
  const keyError = getServiceRoleKeyError();

  let venueSubscriptions: VenueSubscriptionRow[] = [];
  let userPlans: UserPlanRow[] = [];
  let venueOptions: VenueOption[] = [];
  let fetchError: string | null = null;

  if (!keyError) {
    const supabase = createServiceClient();

    const [subResult, plansResult, venuesResult] = await Promise.all([
      (supabase as any)
        .from('venue_subscriptions')
        .select('id, venue_id, plan, status, created_at, venue:venues(name, org_name)')
        .order('created_at', { ascending: false })
        .limit(200),
      (supabase as any)
        .from('user_plans')
        .select('id, user_id, plan, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('venues')
        .select('id, name, org_name')
        .order('name', { ascending: true })
        .limit(500),
    ]);

    if (subResult.error)   fetchError = subResult.error.message;
    if (plansResult.error) fetchError = plansResult.error.message;

    venueSubscriptions = (subResult.data ?? []).map((r: any) => ({
      id:         r.id,
      venue_id:   r.venue_id,
      venue_name: r.venue?.org_name || r.venue?.name || r.venue_id,
      plan:       r.plan,
      status:     r.status,
      created_at: r.created_at,
    }));

    // Enrich user plans with emails via auth.admin
    const rawPlans: UserPlanRow[] = (plansResult.data ?? []).map((r: any) => ({
      id:         r.id,
      user_id:    r.user_id,
      user_email: null,
      plan:       r.plan,
      status:     r.status,
      created_at: r.created_at,
    }));

    if (rawPlans.length > 0) {
      try {
        const { data: usersData } = await (supabase as any).auth.admin.listUsers({ perPage: 1000 });
        const emailById: Record<string, string> = {};
        for (const u of usersData?.users ?? []) {
          if (u.id && u.email) emailById[u.id] = u.email;
        }
        for (const row of rawPlans) {
          row.user_email = emailById[row.user_id] ?? null;
        }
      } catch {
        // non-fatal: emails remain null
      }
    }

    userPlans   = rawPlans;
    venueOptions = (venuesResult.data ?? []) as VenueOption[];
  }

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">

        {/* ── Header ── */}
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
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Plans &amp; Subscriptions</h1>
            <p className="text-body-sm text-muted mt-1">
              Manage venue and consumer plans. Changes take effect immediately.
            </p>
          </div>
          <Link href="/admin">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Admin Console
            </span>
          </Link>
        </div>

        {/* ── Service-role warning ── */}
        {keyError && (
          <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-warning">Service role key required</p>
            <p className="text-body-sm text-warning/80 mt-0.5">
              Add{' '}
              <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">SUPABASE_SERVICE_ROLE_KEY</code>
              {' '}to <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">apps/web/.env.local</code> to manage plans.
            </p>
          </div>
        )}

        {fetchError && (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Error loading data</p>
            <p className="text-body-sm text-error/80 mt-0.5">{fetchError}</p>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            VENUE SUBSCRIPTIONS
        ══════════════════════════════════════════════ */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm font-semibold text-foreground">
              Venue Subscriptions{' '}
              <span className="text-muted font-normal">({venueSubscriptions.length})</span>
            </h2>
          </div>

          {venueSubscriptions.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden mb-6">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-background">
                    <th className={thCls}>Venue</th>
                    <th className={thCls}>Plan</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}>Since</th>
                    <th className={thCls}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {venueSubscriptions.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 hover:bg-background transition-colors ${i % 2 === 1 ? 'bg-background/50' : ''}`}
                    >
                      <td className={`${tdCls} font-medium text-foreground`}>{row.venue_name}</td>
                      <td className={tdCls}>
                        <Badge label={row.plan} cls={PLAN_BADGE[row.plan] ?? PLAN_BADGE.free} />
                      </td>
                      <td className={tdCls}>
                        <Badge label={row.status} cls={STATUS_BADGE[row.status] ?? STATUS_BADGE.inactive} />
                      </td>
                      <td className={`${tdCls} text-muted whitespace-nowrap`}>{formatDate(row.created_at)}</td>
                      <td className={tdCls}>
                        <form action={adminDeleteVenueSubscription}>
                          <input type="hidden" name="venue_id" value={row.venue_id} />
                          <button
                            type="submit"
                            className="text-caption text-error hover:underline"
                            onClick={() => confirm('Remove subscription? Venue reverts to free plan.')}
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !keyError ? (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-8 text-center mb-6">
              <p className="text-body-sm text-muted">No venue subscriptions yet. All venues default to the free plan.</p>
            </div>
          ) : null}

          {/* Upsert form */}
          {!keyError && (
            <div className="rounded-lg border border-border bg-surface shadow-sm p-6">
              <h3 className="text-heading-xs font-semibold text-foreground mb-4">Set / Update Venue Subscription</h3>
              <form action={adminUpsertVenueSubscription} className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1 min-w-[240px] flex-1">
                  <label className="text-caption font-medium text-muted">Venue</label>
                  {venueOptions.length > 0 ? (
                    <select
                      name="venue_id"
                      required
                      className="h-9 px-3 rounded-md border border-border bg-background text-body-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                    >
                      <option value="">— select venue —</option>
                      {venueOptions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.org_name ? `${v.org_name} › ${v.name}` : v.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      name="venue_id"
                      required
                      placeholder="venue UUID"
                      className="h-9 px-3 rounded-md border border-border bg-background text-body-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-caption font-medium text-muted">Plan</label>
                  <select
                    name="plan"
                    required
                    className="h-9 px-3 rounded-md border border-border bg-background text-body-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="listed">listed</option>
                    <option value="basic">basic</option>
                    <option value="featured">featured</option>
                    <option value="premium">premium</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-caption font-medium text-muted">Status</label>
                  <select
                    name="status"
                    required
                    defaultValue="active"
                    className="h-9 px-3 rounded-md border border-border bg-background text-body-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="active">active</option>
                    <option value="trial">trial</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand/90 transition-colors"
                >
                  Save
                </button>
              </form>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════
            USER PLANS
        ══════════════════════════════════════════════ */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm font-semibold text-foreground">
              User Plans{' '}
              <span className="text-muted font-normal">({userPlans.length})</span>
            </h2>
          </div>

          {userPlans.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden mb-6">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-background">
                    <th className={thCls}>User</th>
                    <th className={thCls}>Plan</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}>Since</th>
                    <th className={thCls}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userPlans.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 hover:bg-background transition-colors ${i % 2 === 1 ? 'bg-background/50' : ''}`}
                    >
                      <td className={`${tdCls} font-medium text-foreground`}>
                        {row.user_email ?? (
                          <span className="font-mono text-caption text-muted-light">{row.user_id.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td className={tdCls}>
                        <Badge label={row.plan} cls={PLAN_BADGE[row.plan] ?? PLAN_BADGE.free} />
                      </td>
                      <td className={tdCls}>
                        <Badge label={row.status} cls={STATUS_BADGE[row.status] ?? STATUS_BADGE.inactive} />
                      </td>
                      <td className={`${tdCls} text-muted whitespace-nowrap`}>{formatDate(row.created_at)}</td>
                      <td className={tdCls}>
                        <form action={adminDeleteUserPlan}>
                          <input type="hidden" name="user_id" value={row.user_id} />
                          <button
                            type="submit"
                            className="text-caption text-error hover:underline"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !keyError ? (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-8 text-center mb-6">
              <p className="text-body-sm text-muted">No user plans yet. All users default to the free plan.</p>
            </div>
          ) : null}

          {/* Upsert form */}
          {!keyError && (
            <div className="rounded-lg border border-border bg-surface shadow-sm p-6">
              <h3 className="text-heading-xs font-semibold text-foreground mb-4">Set / Update User Plan</h3>
              <p className="text-body-sm text-muted mb-4">
                Enter the user&apos;s UUID (visible in the Admin Console → Users table).
              </p>
              <form action={adminUpsertUserPlan} className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1 min-w-[260px] flex-1">
                  <label className="text-caption font-medium text-muted">User ID (UUID)</label>
                  <input
                    type="text"
                    name="user_id"
                    required
                    pattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="h-9 px-3 rounded-md border border-border bg-background text-body-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-caption font-medium text-muted">Plan</label>
                  <select
                    name="plan"
                    required
                    className="h-9 px-3 rounded-md border border-border bg-background text-body-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="free">free</option>
                    <option value="power">power</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-caption font-medium text-muted">Status</label>
                  <select
                    name="status"
                    required
                    defaultValue="active"
                    className="h-9 px-3 rounded-md border border-border bg-background text-body-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="active">active</option>
                    <option value="trial">trial</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand/90 transition-colors"
                >
                  Save
                </button>
              </form>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
