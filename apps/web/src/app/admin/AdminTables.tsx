'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { adminToggleWindow, adminToggleVenueStatus, adminSetPromotionTier, type PromotionTier } from '@/actions/admin-actions';

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
  promotion_tier: string | null;
  promotion_priority: number;
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

/* ── Shared classes ── */
const thCls =
  'px-4 py-2.5 text-left text-caption font-semibold text-muted uppercase tracking-wider whitespace-nowrap cursor-pointer select-none';
const tdCls = 'px-4 py-3 text-body-sm align-middle';
const linkCls = 'text-brand font-semibold text-caption whitespace-nowrap hover:text-brand-dark transition-colors';
const badgeGreen = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-success-light text-success';
const badgeGray = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-background text-muted';
const badgeFeatured = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-brand-subtle text-brand-text';
const badgePremium = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-[#EDE9FE] text-[#6D28D9]';
const badgeBasic = 'inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-[#DBEAFE] text-[#2563EB]';

function getPromoBadge(tier: string | null) {
  if (tier === 'featured') return { cls: badgeFeatured, label: '★ Featured' };
  if (tier === 'premium') return { cls: badgePremium, label: 'Premium' };
  if (tier === 'basic') return { cls: badgeBasic, label: 'Basic' };
  return { cls: badgeGray, label: 'Free' };
}
const tableWrap = 'overflow-x-auto rounded-lg border border-border bg-surface shadow-sm';
const tableCls = 'w-full border-collapse text-body-sm';

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
    <th className={thCls} onClick={() => onClick(col)}>
      {label}
      <span className={`ml-1 text-[10px] ${isActive ? 'opacity-100' : 'opacity-30'}`}>
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

/* ════════════════════════════════════════════════════════════════════════
   ORGANIZATIONS TABLE
   ════════════════════════════════════════════════════════════════════════ */
export function OrgsTable({ orgs }: { orgs: OrgRow[] }) {
  const { sorted, col, dir, toggle } = useSort(orgs, 'name');

  return (
    <div className={tableWrap}>
      <table className={tableCls}>
        <thead>
          <tr className="border-b border-border bg-background">
            <SortHeader label="Name" col="name" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Slug" col="slug" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Venues" col="venue_count" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Members" col="member_count" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Created" col="created_at" active={col} dir={dir} onClick={toggle} />
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.id} className="border-b border-border last:border-b-0 hover:bg-background/50 transition-colors">
              <td className={`${tdCls} font-semibold text-foreground`}>{o.name}</td>
              <td className={`${tdCls} font-mono text-caption text-muted`}>{o.slug}</td>
              <td className={`${tdCls} tabular-nums`}>{o.venue_count}</td>
              <td className={`${tdCls} tabular-nums`}>{o.member_count}</td>
              <td className={`${tdCls} text-muted`}>{relativeTime(o.created_at)}</td>
              <td className={tdCls}>
                <Link href={`/orgs/${o.id}?from=admin`} className={linkCls}>Manage &rarr;</Link>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className={`${tdCls} text-muted text-center py-8`}>No organizations yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   VENUES TABLE
   ════════════════════════════════════════════════════════════════════════ */
export function VenuesTable({ venues }: { venues: VenueRow[] }) {
  const { sorted, col, dir, toggle } = useSort(venues, 'org_name');
  const [pending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [promoUpdatingId, setPromoUpdatingId] = useState<string | null>(null);

  function handleStatusToggle(v: VenueRow) {
    setTogglingId(v.id);
    startTransition(async () => {
      try { await adminToggleVenueStatus(v.id, v.status); } catch { /* service role not configured */ }
      setTogglingId(null);
    });
  }

  function handleTierChange(v: VenueRow, newTier: string) {
    const tier = newTier === '' ? null : newTier as PromotionTier;
    setPromoUpdatingId(v.id);
    startTransition(async () => {
      try { await adminSetPromotionTier(v.id, tier); } catch { /* service role not configured */ }
      setPromoUpdatingId(null);
    });
  }

  return (
    <div className={tableWrap}>
      <table className={tableCls}>
        <thead>
          <tr className="border-b border-border bg-background">
            <SortHeader label="Venue" col="org_name" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Location" col="city" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Status" col="status" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Tier" col="promotion_tier" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Priority" col="promotion_priority" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="HH Windows" col="hh_count" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Created" col="created_at" active={col} dir={dir} onClick={toggle} />
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((v) => {
            const displayName = v.org_name || v.name;
            const locationLabel = v.org_name && v.org_name !== v.name ? v.name : null;
            const isToggling = togglingId === v.id;
            const isPromoUpdating = promoUpdatingId === v.id;
            const promo = getPromoBadge(v.promotion_tier);
            return (
              <tr key={v.id} className="border-b border-border last:border-b-0 hover:bg-background/50 transition-colors">
                <td className={tdCls}>
                  <span className="font-semibold text-foreground">{displayName}</span>
                  {locationLabel ? (
                    <div className="text-caption text-muted mt-0.5">{locationLabel}</div>
                  ) : null}
                </td>
                <td className={`${tdCls} text-muted`}>{[v.city, v.state].filter(Boolean).join(', ') || '—'}</td>
                <td className={tdCls}>
                  <button
                    onClick={() => handleStatusToggle(v)}
                    disabled={isToggling || pending}
                    className={`${v.status === 'published' ? badgeGreen : badgeGray} cursor-pointer border-none transition-opacity ${isToggling ? 'opacity-50' : ''}`}
                  >
                    {isToggling ? '...' : v.status ?? 'draft'}
                  </button>
                </td>
                <td className={tdCls}>
                  <select
                    value={v.promotion_tier ?? ''}
                    onChange={(e) => handleTierChange(v, e.target.value)}
                    disabled={isPromoUpdating || pending}
                    className={`${promo.cls} cursor-pointer border-none appearance-none pr-5 bg-no-repeat bg-[right_4px_center] bg-[length:12px] transition-opacity ${isPromoUpdating ? 'opacity-50' : ''}`}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%236B6B6B' stroke-width='1.5'/%3E%3C/svg%3E")` }}
                  >
                    <option value="">Free</option>
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="featured">★ Featured</option>
                  </select>
                </td>
                <td className={`${tdCls} tabular-nums text-center`}>
                  {v.promotion_priority > 0 ? v.promotion_priority : '—'}
                </td>
                <td className={tdCls}>
                  {v.hh_count > 0 ? <span className={badgeGreen}>{v.hh_count}</span> : <span className="text-muted">0</span>}
                </td>
                <td className={`${tdCls} text-muted`}>{relativeTime(v.created_at)}</td>
                <td className={tdCls}>
                  <Link href={`/orgs/${v.org_id}?from=admin`} className={linkCls}>Edit &rarr;</Link>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className={`${tdCls} text-muted text-center py-8`}>No venues yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   HAPPY HOUR WINDOWS TABLE
   ════════════════════════════════════════════════════════════════════════ */
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
    <div className={tableWrap}>
      <table className={tableCls}>
        <thead>
          <tr className="border-b border-border bg-background">
            <SortHeader label="Venue" col="venue_name" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Schedule" col="start_time" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Days" col="dow" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Status" col="status" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Created" col="created_at" active={col} dir={dir} onClick={toggle} />
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((w) => {
            const orgId = w.org_id || venueOrgMap[w.venue_id] || '';
            const isToggling = togglingId === w.id;
            return (
              <tr key={w.id} className="border-b border-border last:border-b-0 hover:bg-background/50 transition-colors">
                <td className={tdCls}>
                  <span className="font-semibold text-foreground">{w.venue_name}</span>
                  {w.location_name && w.location_name !== w.venue_name ? (
                    <div className="text-caption text-muted mt-0.5">{w.location_name}</div>
                  ) : null}
                </td>
                <td className={`${tdCls} font-mono text-caption tabular-nums`}>
                  {formatTime(w.start_time)} – {formatTime(w.end_time)}
                </td>
                <td className={`${tdCls} font-mono text-caption tabular-nums`}>{formatDow(w.dow)}</td>
                <td className={tdCls}>
                  <button
                    onClick={() => handleToggle(w)}
                    disabled={isToggling || pending}
                    className={`${w.status === 'published' ? badgeGreen : badgeGray} cursor-pointer border-none transition-opacity ${isToggling ? 'opacity-50' : ''}`}
                  >
                    {isToggling ? '...' : w.status === 'published' ? 'published' : 'draft'}
                  </button>
                </td>
                <td className={`${tdCls} text-muted`}>{relativeTime(w.created_at)}</td>
                <td className={tdCls}>
                  <Link href={`/orgs/${orgId}/venues/${w.venue_id}?from=admin`} className={linkCls}>Edit &rarr;</Link>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className={`${tdCls} text-muted text-center py-8`}>No windows yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   USERS TABLE
   ════════════════════════════════════════════════════════════════════════ */
export function UsersTable({ users }: { users: UserRow[] }) {
  const { sorted, col, dir, toggle } = useSort(users, 'created_at');

  return (
    <div className={tableWrap}>
      <table className={tableCls}>
        <thead>
          <tr className="border-b border-border bg-background">
            <SortHeader label="Email" col="email" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Joined" col="created_at" active={col} dir={dir} onClick={toggle} />
            <SortHeader label="Last Sign In" col="last_sign_in_at" active={col} dir={dir} onClick={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-background/50 transition-colors">
              <td className={`${tdCls} font-mono text-caption text-foreground`}>{u.email ?? '—'}</td>
              <td className={`${tdCls} text-muted`}>{relativeTime(u.created_at)}</td>
              <td className={`${tdCls} text-muted`}>{relativeTime(u.last_sign_in_at)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={3} className={`${tdCls} text-muted text-center py-8`}>No users yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
