import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import styles from './admin.module.css';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  venue_count: number;
  member_count: number;
};

type VenueRow = {
  id: string;
  org_id: string;
  org_name: string;
  name: string;
  city: string | null;
  state: string | null;
  status: string | null;
  media_count: number;
  hh_count: number;
  created_at: string;
};

type UserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

type WindowRow = {
  id: string;
  venue_id: string;
  venue_name: string;
  org_name: string;
  start_time: string;
  end_time: string;
  status: string;
  dow: number[];
  created_at: string;
};

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatDow(dow: number[]) {
  if (!dow?.length) return '—';
  return dow.map((d) => DOW[d] ?? d).join(' ');
}

function formatTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return t;
  const s = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, '0')} ${s}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  return `${mo}mo ago`;
}

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
    .select('id, org_id, name, city, state, status, created_at, org:organizations(name)')
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
    org_name: v.org?.name ?? '—',
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
    .select('id, venue_id, start_time, end_time, status, dow, created_at, venue:venues(name, org:organizations(name))')
    .order('created_at', { ascending: false })
    .limit(100);

  const windows: WindowRow[] = (windowsRaw ?? []).map((w: any) => ({
    id: w.id,
    venue_id: w.venue_id,
    venue_name: w.venue?.name ?? '—',
    org_name: w.venue?.org?.name ?? '—',
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

      {/* Organizations */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Organizations ({orgs.length})</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Venues</th>
                <th>Members</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className={styles.bold}>{o.name}</td>
                  <td className={styles.mono}>{o.slug}</td>
                  <td>{o.venue_count}</td>
                  <td>{o.member_count}</td>
                  <td className={styles.muted}>{relativeTime(o.created_at)}</td>
                  <td>
                    <Link href={`/orgs/${o.id}`} className={styles.tableLink}>Manage →</Link>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={6} className={styles.empty}>No organizations yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Venues */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Venues ({venues.length})</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Venue</th>
                <th>Organization</th>
                <th>Location</th>
                <th>Status</th>
                <th>Media</th>
                <th>HH Windows</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id}>
                  <td className={styles.bold}>{v.name}</td>
                  <td className={styles.muted}>{v.org_name}</td>
                  <td className={styles.muted}>{[v.city, v.state].filter(Boolean).join(', ') || '—'}</td>
                  <td>
                    <span className={v.status === 'active' ? styles.badgeGreen : styles.badgeGray}>
                      {v.status ?? 'unknown'}
                    </span>
                  </td>
                  <td>{v.media_count > 0 ? <span className={styles.badgeGreen}>{v.media_count}</span> : <span className={styles.muted}>0</span>}</td>
                  <td>{v.hh_count > 0 ? <span className={styles.badgeGreen}>{v.hh_count}</span> : <span className={styles.muted}>0</span>}</td>
                  <td className={styles.muted}>{relativeTime(v.created_at)}</td>
                  <td>
                    <Link href={`/orgs/${v.org_id}/venues/${v.id}`} className={styles.tableLink}>Edit →</Link>
                  </td>
                </tr>
              ))}
              {venues.length === 0 && (
                <tr><td colSpan={8} className={styles.empty}>No venues yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Happy Hour Windows */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Happy Hour Windows ({windows.length})</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Venue</th>
                <th>Organization</th>
                <th>Schedule</th>
                <th>Days</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.id}>
                  <td className={styles.bold}>{w.venue_name}</td>
                  <td className={styles.muted}>{w.org_name}</td>
                  <td className={styles.mono}>{formatTime(w.start_time)} – {formatTime(w.end_time)}</td>
                  <td className={styles.mono}>{formatDow(w.dow)}</td>
                  <td>
                    <span className={w.status === 'published' ? styles.badgeGreen : styles.badgeGray}>
                      {w.status}
                    </span>
                  </td>
                  <td className={styles.muted}>{relativeTime(w.created_at)}</td>
                  <td>
                    <Link href={`/orgs/${venues.find((v) => v.id === w.venue_id)?.org_id ?? ''}/venues/${w.venue_id}`} className={styles.tableLink}>Edit →</Link>
                  </td>
                </tr>
              ))}
              {windows.length === 0 && (
                <tr><td colSpan={7} className={styles.empty}>No windows yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Users */}
      {!keyError && users.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Users ({users.length})</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Joined</th>
                  <th>Last Sign In</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className={styles.mono}>{u.email ?? '—'}</td>
                    <td className={styles.muted}>{relativeTime(u.created_at)}</td>
                    <td className={styles.muted}>{relativeTime(u.last_sign_in_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
