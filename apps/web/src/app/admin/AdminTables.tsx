'use client';

import Link from 'next/link';
import { useState, useTransition, useMemo } from 'react';
import { adminToggleWindow, adminToggleVenueStatus, adminSetPromotionTier, type PromotionTier } from '@/actions/admin-actions';

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Shared classes ──────────────────────────────────────────────────────────────

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

const tableCls = 'w-full border-collapse text-body-sm';

// ── SearchInput ─────────────────────────────────────────────────────────────────

function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-[180px] max-w-xs w-full">
      <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-muted-light">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-3.5-3.5" />
        </svg>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-8 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-2 flex items-center text-muted-light hover:text-muted transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── FilterChips ─────────────────────────────────────────────────────────────────

type ChipOption = { value: string; label: string };

function FilterChips({
  label,
  options,
  active,
  onChange,
}: {
  label?: string;
  options: ChipOption[];
  active: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(active.includes(v) ? active.filter((x) => x !== v) : [...active, v]);
  }
  return (
    <div className="flex items-center gap-1">
      {label && (
        <span className="text-caption text-muted-light whitespace-nowrap mr-0.5">{label}</span>
      )}
      {options.map((o) => {
        const on = active.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`h-7 px-2.5 rounded-md text-caption font-medium border transition-all cursor-pointer whitespace-nowrap ${
              on
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted border-border hover:border-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── PaginationBar ───────────────────────────────────────────────────────────────

function PaginationBar({
  page,
  pageCount,
  pageSize,
  total,
  start,
  setPage,
  setPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  start: number;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
}) {
  const end = Math.min(start + pageSize, total);
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-background">
      <span className="text-caption text-muted">
        {total === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="h-7 rounded border border-border bg-background text-caption text-foreground px-1.5 cursor-pointer focus:ring-1 focus:ring-brand focus:outline-none"
        >
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
        </select>
        <button
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          className="h-7 w-7 rounded border border-border bg-background text-caption flex items-center justify-center hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Previous page"
        >
          ←
        </button>
        <span className="text-caption text-muted tabular-nums select-none">{page}/{pageCount}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page >= pageCount}
          className="h-7 w-7 rounded border border-border bg-background text-caption flex items-center justify-center hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
}

// ── FilterSummary ───────────────────────────────────────────────────────────────

function FilterSummary({
  parts,
  count,
  onClear,
}: {
  parts: string[];
  count: number;
  onClear: () => void;
}) {
  if (parts.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 mt-2 mb-1 text-caption text-muted flex-wrap">
      <span className="text-muted-light">Filtering:</span>
      <span>{parts.join(', ')}</span>
      <span className="text-muted-light">—</span>
      <span className="font-semibold text-foreground tabular-nums">
        {count} result{count !== 1 ? 's' : ''}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 text-brand hover:text-brand-dark font-semibold transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}

// ── SortHeader ──────────────────────────────────────────────────────────────────

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

// ── useSort ─────────────────────────────────────────────────────────────────────

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

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv;
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        }
        return dir === 'asc' ? cmp : -cmp;
      }),
    [rows, col, dir]
  );

  return { sorted, col: col as string, dir, toggle };
}

/* ════════════════════════════════════════════════════════════════════════
   ORGANIZATIONS TABLE
   ════════════════════════════════════════════════════════════════════════ */
export function OrgsTable({ orgs }: { orgs: OrgRow[] }) {
  const { sorted, col, dir, toggle } = useSort(orgs, 'name');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  const filterParts: string[] = [];
  if (search) filterParts.push(`"${search}"`);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={handleSearch} placeholder="Search by name or slug…" />
      </div>
      <FilterSummary parts={filterParts} count={total} onClear={() => { setSearch(''); setPage(1); }} />
      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
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
              {paged.map((o) => (
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
              {paged.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${tdCls} text-muted text-center py-8`}>
                    {filtered.length === 0 && search ? 'No organizations match your search.' : 'No organizations yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={safePage} pageCount={pageCount} pageSize={pageSize}
          total={total} start={start}
          setPage={setPage}
          setPageSize={(s) => { setPageSize(s); setPage(1); }}
        />
      </div>
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

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [tierFilter, setTierFilter] = useState<string[]>([]);
  const [hasMedia, setHasMedia] = useState<string[]>([]);
  const [hasHH, setHasHH] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function resetFilters() {
    setSearch('');
    setStatusFilter([]);
    setTierFilter([]);
    setHasMedia([]);
    setHasHH([]);
    setPage(1);
  }

  const filtered = useMemo(() => {
    let r = sorted;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.org_name.toLowerCase().includes(q) ||
          (v.city ?? '').toLowerCase().includes(q) ||
          (v.state ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter.length) {
      r = r.filter((v) => statusFilter.includes(v.status ?? 'draft'));
    }
    if (tierFilter.length) {
      r = r.filter((v) => tierFilter.includes(v.promotion_tier ?? 'none'));
    }
    if (hasMedia.length === 1) {
      r = r.filter((v) => (hasMedia[0] === 'yes' ? v.media_count > 0 : v.media_count === 0));
    }
    if (hasHH.length === 1) {
      r = r.filter((v) => (hasHH[0] === 'yes' ? v.hh_count > 0 : v.hh_count === 0));
    }
    return r;
  }, [sorted, search, statusFilter, tierFilter, hasMedia, hasHH]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const filterParts: string[] = [];
  if (search) filterParts.push(`"${search}"`);
  if (statusFilter.length) filterParts.push(`status=${statusFilter.join('/')}`);
  if (tierFilter.length) filterParts.push(`tier=${tierFilter.join('/')}`);
  if (hasMedia.length === 1) filterParts.push(hasMedia[0] === 'yes' ? 'has media' : 'no media');
  if (hasHH.length === 1) filterParts.push(hasHH[0] === 'yes' ? 'has HH' : 'no HH');

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
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search venues…" />
        <FilterChips
          label="Status"
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
            { value: 'archived', label: 'Archived' },
          ]}
          active={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
        />
        <FilterChips
          label="Tier"
          options={[
            { value: 'featured', label: '★ Featured' },
            { value: 'premium', label: 'Premium' },
            { value: 'basic', label: 'Basic' },
            { value: 'none', label: 'Free' },
          ]}
          active={tierFilter}
          onChange={(v) => { setTierFilter(v); setPage(1); }}
        />
        <FilterChips
          label="Media"
          options={[{ value: 'yes', label: 'Has media' }, { value: 'no', label: 'None' }]}
          active={hasMedia}
          onChange={(v) => { setHasMedia(v); setPage(1); }}
        />
        <FilterChips
          label="HH"
          options={[{ value: 'yes', label: 'Has windows' }, { value: 'no', label: 'None' }]}
          active={hasHH}
          onChange={(v) => { setHasHH(v); setPage(1); }}
        />
      </div>
      <FilterSummary parts={filterParts} count={total} onClear={resetFilters} />
      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
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
              {paged.map((v) => {
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
              {paged.length === 0 && (
                <tr>
                  <td colSpan={8} className={`${tdCls} text-muted text-center py-8`}>
                    {filterParts.length > 0 ? 'No venues match your filters.' : 'No venues yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={safePage} pageCount={pageCount} pageSize={pageSize}
          total={total} start={start}
          setPage={setPage}
          setPageSize={(s) => { setPageSize(s); setPage(1); }}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   HAPPY HOUR WINDOWS TABLE
   ════════════════════════════════════════════════════════════════════════ */
export function WindowsTable({ windows, venues }: { windows: WindowRow[]; venues: VenueRow[] }) {
  const { sorted, col, dir, toggle } = useSort(windows, 'venue_name');
  const venueOrgMap = useMemo(
    () => Object.fromEntries(venues.map((v) => [v.id, v.org_id])),
    [venues]
  );
  const [pending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function resetFilters() {
    setSearch('');
    setStatusFilter([]);
    setPage(1);
  }

  const filtered = useMemo(() => {
    let r = sorted;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (w) =>
          w.venue_name.toLowerCase().includes(q) ||
          w.location_name.toLowerCase().includes(q)
      );
    }
    if (statusFilter.length) {
      r = r.filter((w) => statusFilter.includes(w.status));
    }
    return r;
  }, [sorted, search, statusFilter]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const filterParts: string[] = [];
  if (search) filterParts.push(`"${search}"`);
  if (statusFilter.length) filterParts.push(`status=${statusFilter.join('/')}`);

  function handleToggle(w: WindowRow) {
    setTogglingId(w.id);
    startTransition(async () => {
      try { await adminToggleWindow(w.id, w.status); } catch { /* service role not configured */ }
      setTogglingId(null);
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by venue name…" />
        <FilterChips
          label="Status"
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
          ]}
          active={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
        />
      </div>
      <FilterSummary parts={filterParts} count={total} onClear={resetFilters} />
      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
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
              {paged.map((w) => {
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
              {paged.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${tdCls} text-muted text-center py-8`}>
                    {filterParts.length > 0 ? 'No windows match your filters.' : 'No windows yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={safePage} pageCount={pageCount} pageSize={pageSize}
          total={total} start={start}
          setPage={setPage}
          setPageSize={(s) => { setPageSize(s); setPage(1); }}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   USERS TABLE
   ════════════════════════════════════════════════════════════════════════ */
export function UsersTable({ users }: { users: UserRow[] }) {
  const { sorted, col, dir, toggle } = useSort(users, 'created_at');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((u) => (u.email ?? '').toLowerCase().includes(q));
  }, [sorted, search]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const filterParts: string[] = [];
  if (search) filterParts.push(`"${search}"`);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by email…" />
      </div>
      <FilterSummary parts={filterParts} count={total} onClear={() => { setSearch(''); setPage(1); }} />
      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr className="border-b border-border bg-background">
                <SortHeader label="Email" col="email" active={col} dir={dir} onClick={toggle} />
                <SortHeader label="Joined" col="created_at" active={col} dir={dir} onClick={toggle} />
                <SortHeader label="Last Sign In" col="last_sign_in_at" active={col} dir={dir} onClick={toggle} />
              </tr>
            </thead>
            <tbody>
              {paged.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-background/50 transition-colors">
                  <td className={`${tdCls} font-mono text-caption text-foreground`}>{u.email ?? '—'}</td>
                  <td className={`${tdCls} text-muted`}>{relativeTime(u.created_at)}</td>
                  <td className={`${tdCls} text-muted`}>{relativeTime(u.last_sign_in_at)}</td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={3} className={`${tdCls} text-muted text-center py-8`}>
                    {search ? 'No users match your search.' : 'No users yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={safePage} pageCount={pageCount} pageSize={pageSize}
          total={total} start={start}
          setPage={setPage}
          setPageSize={(s) => { setPageSize(s); setPage(1); }}
        />
      </div>
    </div>
  );
}
