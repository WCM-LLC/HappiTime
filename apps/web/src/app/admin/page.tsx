import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { OrgsTable, VenuesTable, WindowsTable, UsersTable } from './AdminTables';
import type { OrgRow, VenueRow, WindowRow, UserRow } from './AdminTables';
import styles from './admin.module.css';

export default async function AdminPage() {
  const keyError = getServiceRoleKeyError();
  const supabase = keyError ? await createClient() : createServiceClient();
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();

  // ─── Stats ───────────────────────────────────────────────────────────
  const [
    { count: orgCount },
    { count: venueCount },
    { count: memberCount },
    { count: hhCount },
    { count: mediaCount },
  ] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }),
    supabase.from('venues').select('id', { count: 'exact', head: true }),
    supabase.from('org_members').select('id', { count: 'exact', head: true }),
    supabase.from('happy_hour_windows').select('id', { count: 'exact', head: true }),
    supabase.from('venue_media').select('id', { count: 'exact', head: true }),
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
    .select('id, org_id, name, org_name, city, state, status, created_at')
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
    // Primary display: org_name (the brand), fallback to venue name
    venue_name: w.venue?.org_name || w.venue?.name || '—',
    // Secondary: venue location name when different from brand
    location_name: w.venue?.name || '—',
    org_id: w.venue?.org_id || '',
    start_time: w.start_time,
    end_time: w.end_time,
    status: w.status,
    dow: w.dow ?? [],
    created_at: w.created_at,
  }));

  // ─── Users (requires service role) ───────────────────────────────────
  let users: UserRow[] = [];
  if (!keyError) {
    const { data: usersRaw } = await (supabase as any).auth.admin.listUsers({ perPage: 50 });
    users = (usersRaw?.users ?? []).map((u: any) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));
  }

  const stats = [
    { label: 'Organizations', value: orgCount ?? 0 },
    { label: 'Venues', value: venueCount ?? 0 },
    { label: 'Members', value: memberCount ?? 0 },
    { label: 'Happy Hours', value: hhCount ?? 0 },
    { label: 'Media Files', value: mediaCount ?? 0 },
  ];

  return (
    <main className={styles.admin}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>HappiTime Admin</h1>
          <p className={styles.subheading}>Signed in as {auth.user?.email}</p>
        </div>
        <Link href="/dashboard" className={styles.backLink}>← Dashboard</Link>
      </div>

      {keyError ? (
        <div className={styles.warningBanner}>
          <strong>Limited mode:</strong> Add <code>SUPABASE_SERVICE_ROLE_KEY</code> to{' '}
          <code>apps/web/.env.local</code> for full admin access (user list, RLS bypass).
          {keyError === 'invalid' ? ' The current key is present but has the wrong role.' : ''}
        </div>
      ) : null}

      {/* Stats */}
      <div className={styles.statsGrid}>
        {stats.map((s) => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statValue}>{s.value.toLocaleString()}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Organizations ({orgs.length})</h2>
        <OrgsTable orgs={orgs} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Venues ({venues.length})</h2>
        <VenuesTable venues={venues} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Happy Hour Windows ({windows.length})</h2>
        <WindowsTable windows={windows} venues={venues} />
      </section>

      {!keyError && users.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Users ({users.length})</h2>
          <UsersTable users={users} />
        </section>
      ) : null}

      {keyError ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Users</h2>
          <p className={styles.empty}>Add <code>SUPABASE_SERVICE_ROLE_KEY</code> to view user data.</p>
        </section>
      ) : null}
    </main>
  );
}
