import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { OrgsTable, VenuesTable, WindowsTable, UsersTable } from './AdminTables';
import type { OrgRow, VenueRow, WindowRow, UserRow } from './AdminTables';
import { SUPER_ADMIN_EMAIL } from '@/utils/admin-emails';
import { addAdminUser, removeAdminUser } from '@/actions/admin-manage-actions';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const pageError = sp?.error;
  const pageNotice = sp?.notice;

  const NOTICE_MESSAGES: Record<string, string> = {
    password_reset_sent: 'Password-reset email sent.',
    user_updated: 'User info updated.',
    org_updated: 'Organization updated. Venue display names propagated automatically.',
  };
  const noticeText = pageNotice ? (NOTICE_MESSAGES[pageNotice] ?? null) : null;

  const ERROR_MESSAGES: Record<string, string> = {
    // User-action errors
    missing_user_id: 'No user was selected.',
    user_not_staff: 'That user is not an owner, manager, or host — action skipped to be safe.',
    user_email_not_found: "We couldn't find an email address for that user.",
    password_reset_failed: 'Password reset failed. Check Supabase Auth → Emails is configured, then try again.',
    invalid_email: 'That email address is not valid.',
    user_update_failed: 'Updating the user failed. Check the logs.',
    member_update_failed: 'Updating the user worked, but their org membership rows failed to sync. Try again.',

    // Org-action errors
    missing_org_id: 'No organization was selected.',
    org_name_required: 'Organization name is required.',
    invalid_slug: 'Slug must be lowercase letters, numbers, and hyphens (no leading or trailing hyphen).',
    slug_taken: 'That slug is already in use by another organization.',
    org_not_found: 'Organization not found, or it was deleted before the update completed.',

    // Admin-user (super-admin only) errors
    missing_email: 'Email address is required.',
    cannot_remove_super_admin: 'The super admin cannot be removed.',
  };
  const errorText = pageError ? (ERROR_MESSAGES[pageError] ?? pageError) : null;
  const keyError = getServiceRoleKeyError();
  const supabase = keyError ? await createClient() : createServiceClient();
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const currentUserEmail = (auth.user?.email ?? '').toLowerCase();
  const isSuperAdmin = currentUserEmail === SUPER_ADMIN_EMAIL;

  // ─── Stats ───────────────────────────────────────────────────────────
  const [
    { count: orgCount },
    { count: venueCount },
    { count: memberCount },
    { count: hhCount },
    { count: mediaCount },
    { count: suggestionCount },
  ] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }),
    supabase.from('venues').select('id', { count: 'exact', head: true }),
    supabase.from('org_members').select('id', { count: 'exact', head: true }),
    supabase.from('happy_hour_windows').select('id', { count: 'exact', head: true }),
    supabase.from('venue_media').select('id', { count: 'exact', head: true }),
    supabase.from('user_events').select('id', { count: 'exact', head: true }).eq('event_type', 'venue_suggestion'),
  ]);

  // ─── Organizations ────────────────────────────────────────────────────
  const { data: orgsRaw } = await supabase
    .from('organizations')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const orgIds = (orgsRaw ?? []).map((o) => o.id);

  const [{ data: venueCounts }, { data: memberCounts }] = await Promise.all([
    orgIds.length > 0
      ? supabase.from('venues').select('org_id').in('org_id', orgIds)
      : Promise.resolve({ data: [] }),
    orgIds.length > 0
      ? supabase.from('org_members').select('org_id').in('org_id', orgIds)
      : Promise.resolve({ data: [] }),
  ]);

  const vcByOrg = (venueCounts ?? []).reduce<Record<string, number>>((a, r: any) => {
    a[r.org_id] = (a[r.org_id] ?? 0) + 1;
    return a;
  }, {});
  const mcByOrg = (memberCounts ?? []).reduce<Record<string, number>>((a, r: any) => {
    a[r.org_id] = (a[r.org_id] ?? 0) + 1;
    return a;
  }, {});

  const orgs: OrgRow[] = (orgsRaw ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    created_at: o.created_at,
    venue_count: vcByOrg[o.id] ?? 0,
    member_count: mcByOrg[o.id] ?? 0,
  }));

  // ─── Venues ──────────────────────────────────────────────────────────
  const { data: venuesRaw } = await supabase
    .from('venues')
    .select('id, org_id, name, org_name, city, state, status, promotion_tier, promotion_priority, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const venueIds = (venuesRaw ?? []).map((v) => v.id);

  const [{ data: mediaCounts }, { data: hhCounts }] = await Promise.all([
    venueIds.length > 0
      ? supabase.from('venue_media').select('venue_id').eq('status', 'published').in('venue_id', venueIds)
      : Promise.resolve({ data: [] }),
    venueIds.length > 0
      ? supabase.from('happy_hour_windows').select('venue_id').eq('status', 'published').in('venue_id', venueIds)
      : Promise.resolve({ data: [] }),
  ]);

  const medByVenue = (mediaCounts ?? []).reduce<Record<string, number>>((a, r: any) => {
    a[r.venue_id] = (a[r.venue_id] ?? 0) + 1;
    return a;
  }, {});
  const hhByVenue = (hhCounts ?? []).reduce<Record<string, number>>((a, r: any) => {
    a[r.venue_id] = (a[r.venue_id] ?? 0) + 1;
    return a;
  }, {});

  const venues: VenueRow[] = (venuesRaw ?? []).map((v: any) => ({
    id: v.id,
    org_id: v.org_id,
    org_name: v.org_name ?? '',
    name: v.name,
    city: v.city,
    state: v.state,
    status: v.status,
    promotion_tier: v.promotion_tier ?? null,
    promotion_priority: v.promotion_priority ?? 0,
    media_count: medByVenue[v.id] ?? 0,
    hh_count: hhByVenue[v.id] ?? 0,
    created_at: v.created_at,
  }));

  // ─── Happy Hour Windows ───────────────────────────────────────────────
  const { data: windowsRaw } = await supabase
    .from('happy_hour_windows')
    .select('id, venue_id, start_time, end_time, status, dow, created_at, venue:venues(name, org_name, org_id)')
    .order('created_at', { ascending: false })
    .limit(100);

  const windows: WindowRow[] = (windowsRaw ?? []).map((w: any) => ({
    id: w.id,
    venue_id: w.venue_id,
    venue_name: w.venue?.org_name || w.venue?.name || '—',
    location_name: w.venue?.name || '—',
    org_id: w.venue?.org_id || '',
    start_time: w.start_time,
    end_time: w.end_time,
    status: w.status,
    dow: w.dow ?? [],
    created_at: w.created_at,
  }));

  // ─── Users (only owners, managers, hosts) ────────────────────────────
  let users: UserRow[] = [];
  if (!keyError) {
    // 1. Pull qualifying memberships only
    const { data: memberRows } = await supabase
      .from('org_members')
      .select('user_id, role, org_id, email, first_name, last_name')
      .in('role', ['owner', 'manager', 'host']);

    const members = memberRows ?? [];

    if (members.length > 0) {
      // 2. Org name lookup
      const memberOrgIds = Array.from(new Set(members.map((m: any) => m.org_id))).filter(Boolean);
      const { data: orgsForUsers } = memberOrgIds.length > 0
        ? await supabase.from('organizations').select('id, name').in('id', memberOrgIds)
        : { data: [] as any[] };
      const orgNameById: Record<string, string> = {};
      for (const o of orgsForUsers ?? []) orgNameById[(o as any).id] = (o as any).name;

      // 3. Group memberships by user
      type MembershipSummary = { org_id: string; org_name: string; role: string };
      const byUser = new Map<string, {
        id: string;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
        memberships: MembershipSummary[];
      }>();
      for (const m of members as any[]) {
        const entry = byUser.get(m.user_id) ?? {
          id: m.user_id,
          email: m.email ?? null,
          first_name: m.first_name ?? null,
          last_name: m.last_name ?? null,
          memberships: [] as MembershipSummary[],
        };
        entry.first_name = entry.first_name ?? m.first_name ?? null;
        entry.last_name = entry.last_name ?? m.last_name ?? null;
        entry.email = entry.email ?? m.email ?? null;
        entry.memberships.push({
          org_id: m.org_id,
          org_name: orgNameById[m.org_id] ?? '—',
          role: m.role,
        });
        byUser.set(m.user_id, entry);
      }

      // 4. Enrich with auth user data (paginated to handle larger user pools)
      const authIndex = new Map<string, any>();
      let page = 1;
      while (true) {
        const { data, error } = await (supabase as any).auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        for (const u of data?.users ?? []) authIndex.set(u.id, u);
        if (!data?.nextPage) break;
        page = data.nextPage;
      }

      // 5. Final shape
      users = Array.from(byUser.values()).map((u) => {
        const auth = authIndex.get(u.id);
        return {
          id: u.id,
          email: auth?.email ?? u.email ?? null,
          first_name: u.first_name ?? auth?.user_metadata?.first_name ?? null,
          last_name: u.last_name ?? auth?.user_metadata?.last_name ?? null,
          created_at: auth?.created_at ?? new Date().toISOString(),
          last_sign_in_at: auth?.last_sign_in_at ?? null,
          memberships: u.memberships,
        } as UserRow;
      });
    }
  }

  // ─── Admin users (super-admin only) ──────────────────────────────────
  let adminUsers: { email: string; created_at: string }[] = [];
  if (isSuperAdmin && !keyError) {
    const { data: adminUsersRaw } = await supabase
      .from('admin_users')
      .select('email, created_at')
      .order('created_at', { ascending: true });
    adminUsers = adminUsersRaw ?? [];
  }

  const stats: { label: string; value: number; icon: string; href?: string }[] = [
    { label: 'Organizations', value: orgCount ?? 0, icon: '⚙️' },
    { label: 'Venues', value: venueCount ?? 0, icon: '🍺' },
    { label: 'Members', value: memberCount ?? 0, icon: '👥' },
    { label: 'Happy Hours', value: hhCount ?? 0, icon: '⏰' },
    { label: 'Media Files', value: mediaCount ?? 0, icon: '📷' },
    { label: 'Suggestions', value: suggestionCount ?? 0, icon: '📍', href: '/admin/suggestions' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* ── Page Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Admin Console</h1>
            <p className="text-body-sm text-muted mt-1">
              Signed in as {auth.user?.email}
            </p>
          </div>
          <Link href="/dashboard">
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Dashboard
            </span>
          </Link>
        </div>

        {/* ── Action Error Banner ── */}
        {errorText ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Action failed</p>
            <p className="text-body-sm text-error/80 mt-0.5">{errorText}</p>
          </div>
        ) : null}

        {/* ── Success Notice ── */}
        {noticeText ? (
          <div className="rounded-md border border-success bg-success-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-success">{noticeText}</p>
          </div>
        ) : null}

        {/* ── Warning Banner ── */}
        {keyError ? (
          <div className="rounded-md border border-warning bg-warning-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-warning">Limited mode</p>
            <p className="text-body-sm text-warning/80 mt-0.5">
              Add <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">SUPABASE_SERVICE_ROLE_KEY</code> to{' '}
              <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">apps/web/.env.local</code> for full admin access (user list, RLS bypass).
              {keyError === 'invalid' ? ' The current key is present but has the wrong role.' : ''}
            </p>
          </div>
        ) : null}

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          {stats.map((s) => {
            const inner = (
              <div className={`rounded-lg border border-border bg-surface p-5 shadow-sm${s.href ? ' hover:border-brand hover:shadow-md transition-all' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-caption font-semibold text-muted uppercase tracking-wider">{s.label}</span>
                  <span className="text-body-sm">{s.icon}</span>
                </div>
                <div className="text-display-md font-bold text-foreground tracking-tight leading-none">
                  {s.value.toLocaleString()}
                </div>
              </div>
            );
            return s.href
              ? <Link key={s.label} href={s.href}>{inner}</Link>
              : <div key={s.label}>{inner}</div>;
          })}
        </div>

        {/* ── Organizations ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm font-semibold text-foreground">
              Organizations <span className="text-muted font-normal">({orgs.length})</span>
            </h2>
          </div>
          <OrgsTable orgs={orgs} />
        </section>

        {/* ── Venues ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm font-semibold text-foreground">
              Venues <span className="text-muted font-normal">({venues.length})</span>
            </h2>
          </div>
          <VenuesTable venues={venues} />
        </section>

        {/* ── Happy Hour Windows ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm font-semibold text-foreground">
              Happy Hour Windows <span className="text-muted font-normal">({windows.length})</span>
            </h2>
          </div>
          <WindowsTable windows={windows} venues={venues} />
        </section>

        {/* ── Users (Owners, Managers, Hosts) ── */}
        {!keyError && users.length > 0 ? (
          <section className="mb-10">
            <div className="mb-4">
              <h2 className="text-heading-sm font-semibold text-foreground">
                Users <span className="text-muted font-normal">({users.length})</span>
              </h2>
              <p className="text-body-sm text-muted mt-0.5">
                Owners, managers, and hosts across all organizations. Edit info or send a password-reset email.
              </p>
            </div>
            <UsersTable users={users} />
          </section>
        ) : null}

        {keyError ? (
          <section className="mb-10">
            <h2 className="text-heading-sm font-semibold text-foreground mb-4">Users</h2>
            <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-8 text-center">
              <p className="text-body-sm text-muted">
                Add <code className="text-caption bg-background px-1.5 py-0.5 rounded border border-border">SUPABASE_SERVICE_ROLE_KEY</code> to view user data.
              </p>
            </div>
          </section>
        ) : users.length === 0 ? (
          <section className="mb-10">
            <div className="mb-4">
              <h2 className="text-heading-sm font-semibold text-foreground">Users</h2>
              <p className="text-body-sm text-muted mt-0.5">
                Owners, managers, and hosts across all organizations.
              </p>
            </div>
            <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-8 text-center">
              <p className="text-body-sm text-muted">No owners, managers, or hosts yet. Add staff via an organization's Access page.</p>
            </div>
          </section>
        ) : null}

        {/* ── Incoming Suggestions ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-heading-sm font-semibold text-foreground">
                Incoming Suggestions{' '}
                {(suggestionCount ?? 0) > 0 && (
                  <span className="inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand-dark-alt ml-2">
                    {suggestionCount} pending
                  </span>
                )}
              </h2>
              <p className="text-body-sm text-muted mt-0.5">Venue suggestions submitted by users from the mobile app.</p>
            </div>
            <Link href="/admin/suggestions">
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
                View all &rarr;
              </span>
            </Link>
          </div>
        </section>

        {/* ── Admin Users (super-admin only) ── */}
        {isSuperAdmin ? (
          <section className="mb-10">
            <div className="mb-4">
              <h2 className="text-heading-sm font-semibold text-foreground">Admin Users</h2>
              <p className="text-body-sm text-muted mt-0.5">
                Accounts with admin console access. Only you can add or remove admins.
              </p>
            </div>

            {keyError ? (
              <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-8 text-center">
                <p className="text-body-sm text-muted">
                  Add <code className="text-caption bg-background px-1.5 py-0.5 rounded border border-border">SUPABASE_SERVICE_ROLE_KEY</code> to manage admin users.
                </p>
              </div>
            ) : (
              <>
                {/* Add admin form */}
                <div className="rounded-lg border border-border bg-surface p-5 shadow-sm mb-4">
                  <form className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label htmlFor="new-admin-email" className="text-body-sm font-medium text-foreground block mb-1.5">
                        Email address
                      </label>
                      <input
                        id="new-admin-email"
                        name="email"
                        type="email"
                        required
                        placeholder="colleague@example.com"
                        className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                      />
                    </div>
                    <button
                      formAction={addAdminUser}
                      className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer shrink-0"
                    >
                      Add admin
                    </button>
                  </form>
                </div>

                {/* Current admin list */}
                <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
                  {adminUsers.length === 0 ? (
                    <p className="text-body-sm text-muted p-5">No admin users found.</p>
                  ) : (
                    <table className="w-full text-body-sm">
                      <thead>
                        <tr className="border-b border-border bg-background/50">
                          <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Email</th>
                          <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Added</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((u) => (
                          <tr key={u.email} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
                            <td className="px-4 py-3 text-foreground font-medium">
                              {u.email}
                              {u.email === SUPER_ADMIN_EMAIL ? (
                                <span className="ml-2 inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand-dark-alt">
                                  super admin
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-muted">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {u.email !== SUPER_ADMIN_EMAIL ? (
                                <form>
                                  <input type="hidden" name="email" value={u.email} />
                                  <button
                                    formAction={removeAdminUser}
                                    className="text-caption font-medium text-error hover:underline cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                </form>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
