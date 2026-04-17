'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { adminToggleWindow, adminToggleVenueStatus } from '@/actions/admin-actions';
import styles from './admin.module.css';

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  venue_count: number;
  member_count: number;
};

export type VenueRow = {
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

export type WindowRow = {
  id: string;
  venue_id: string;
  venue_name: string;
  location_name: string;
  org_id: string;
  start_time: string;
  end_time: string;
  status: string;
  dow: number[];
  created_at: string;
};

export type UserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
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

type SortDir = 'asc' | 'desc';

function SortHeader({
  label,
  col,
  active,
  dir,
  onClick,
}: {
  label: string;
  col: string;
  active: string;
  dir: SortDir;
  onClick: (col: string) => void;
}) {
  const isActive = active === col;
  return (
    <th
      onClick={() => onClick(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}
      <span style={{ marginLeft: 4, opacity: isActive ? 1 : 0.3, fontSize: 10 }}>
        {isActive ? (dir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  );
}

function useSort<T>(rows: T[], defaultCol: keyof T) {
  const [col, setCol] = useState<keyof T>(defaultCol);
  const [dir, setDir] = useState<SortDir>('asc');

  function toggle(next: string) {
    const k = next as keyof T;
    if (k === col) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setCol(k);
      setDir('asc');
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av ?? '').localeCompare(String(bv ?? ''));
    }
    return dir === 'asc' ? cmp : -cmp;
  });

  return { sorted, col: col as string, dir, toggle };
}

export function OrgsTable({ orgs }: { orgs: OrgRow[] }) {
  const { sorted, col, dir, toggle } = useSort(orgs, 'name');

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortHeader label="Name" col="name" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Slug" col="slug" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Venues" col="venue_count" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Members" col="member_count" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Created" col="created_at" active={col} dir={dir} onClick={toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.id}>
              <td className={styles.bold}>{o.name}</td>
              <td className={styles.mono}>{o.slug}</td>
              <td>{o.venue_count}</td>
              <td>{o.member_count}</td>
              <td className={styles.muted}>{relativeTime(o.created_at)}</td>
              <td>
                <Link href={`/orgs/${o.id}?from=admin`} className={styles.tableLink}>Manage →</Link>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={6} className={styles.empty}>No organizations yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function VenuesTable({ venues }: { venues: VenueRow[] }) {
  const { sorted, col, dir, toggle } = useSort(venues, 'org_name');
  const [pending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function handleStatusToggle(v: VenueRow) {
    setTogglingId(v.id);
    startTransition(async () => {
      try { await adminToggleVenueStatus(v.id, v.status); } catch { /* service role not configured */ }
      setTogglingId(null);
    });
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortHeader label="Venue" col="org_name" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Location" col="city" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Status" col="status" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Media" col="media_count" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="HH Windows" col="hh_count" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Created" col="created_at" active={col} dir={dir} onClick={toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((v) => {
            const displayName = v.org_name || v.name;
            const locationLabel = v.org_name && v.org_name !== v.name ? v.name : null;
            const isToggling = togglingId === v.id;
            return (
              <tr key={v.id}>
                <td>
                  <span className={styles.bold}>{displayName}</span>
                  {locationLabel ? (
                    <div className={styles.muted} style={{ fontSize: 11, marginTop: 1 }}>{locationLabel}</div>
                  ) : null}
                </td>
                <td className={styles.muted}>{[v.city, v.state].filter(Boolean).join(', ') || '—'}</td>
                <td>
                  <button
                    onClick={() => handleStatusToggle(v)}
                    disabled={isToggling || pending}
                    style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 999, cursor: 'pointer', background: v.status === 'published' ? '#d1fae5' : '#f3f4f6', color: v.status === 'published' ? '#065f46' : '#6b7280' }}
                  >
                    {isToggling ? '…' : v.status ?? 'draft'}
                  </button>
                </td>
                <td>{v.media_count > 0 ? <span className={styles.badgeGreen}>{v.media_count}</span> : <span className={styles.muted}>0</span>}</td>
                <td>{v.hh_count > 0 ? <span className={styles.badgeGreen}>{v.hh_count}</span> : <span className={styles.muted}>0</span>}</td>
                <td className={styles.muted}>{relativeTime(v.created_at)}</td>
                <td>
                  <Link href={`/orgs/${v.org_id}?from=admin`} className={styles.tableLink}>Edit →</Link>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={7} className={styles.empty}>No venues yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function WindowsTable({ windows, venues }: { windows: WindowRow[]; venues: VenueRow[] }) {
  const { sorted, col, dir, toggle } = useSort(windows, 'venue_name');
  const venueOrgMap = Object.fromEntries(venues.map((v) => [v.id, v.org_id]));
  const [pending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function handleToggle(w: WindowRow) {
    setTogglingId(w.id);
    startTransition(async () => {
      try { await adminToggleWindow(w.id, w.status); } catch { /* service role not configured */ }
      setTogglingId(null);
    });
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortHeader label="Venue" col="venue_name" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Schedule" col="start_time" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Days" col="dow" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Status" col="status" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Created" col="created_at" active={col} dir={dir} onClick={toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((w) => {
            const orgId = w.org_id || venueOrgMap[w.venue_id] || '';
            const isToggling = togglingId === w.id;
            return (
              <tr key={w.id}>
                <td>
                  <span className={styles.bold}>{w.venue_name}</span>
                  {w.location_name && w.location_name !== w.venue_name ? (
                    <div className={styles.muted} style={{ fontSize: 11, marginTop: 1 }}>{w.location_name}</div>
                  ) : null}
                </td>
                <td className={styles.mono}>{formatTime(w.start_time)} – {formatTime(w.end_time)}</td>
                <td className={styles.mono}>{formatDow(w.dow)}</td>
                <td>
                  <button
                    onClick={() => handleToggle(w)}
                    disabled={isToggling || pending}
                    style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 999, cursor: 'pointer', background: w.status === 'published' ? '#d1fae5' : '#f3f4f6', color: w.status === 'published' ? '#065f46' : '#6b7280' }}
                  >
                    {isToggling ? '…' : w.status === 'published' ? 'published' : 'draft'}
                  </button>
                </td>
                <td className={styles.muted}>{relativeTime(w.created_at)}</td>
                <td>
                  <Link href={`/orgs/${orgId}/venues/${w.venue_id}?from=admin`} className={styles.tableLink}>Edit →</Link>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={6} className={styles.empty}>No windows yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const { sorted, col, dir, toggle } = useSort(users, 'created_at');

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortHeader label="Email" col="email" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Joined" col="created_at" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Last Sign In" col="last_sign_in_at" active={col} dir={dir} onClick={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => (
            <tr key={u.id}>
              <td className={styles.mono}>{u.email ?? '—'}</td>
              <td className={styles.muted}>{relativeTime(u.created_at)}</td>
              <td className={styles.muted}>{relativeTime(u.last_sign_in_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
