'use client';

import Link from 'next/link';
import { useState, useTransition, useCallback, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminPromoteStagingVenue, adminRejectStagingVenue } from '@/actions/admin-staging-actions';

// ── Types ───────────────────────────────────────────────────────────────────────

type OrgOption = { id: string; name: string; slug: string };

export type StagingRow = {
  id: string;
  external_ref: string | null;
  payload: Record<string, unknown>;
  status: string;
  source: string;
  created_at: string;
  rejection_reason: string | null;
  match_venue_id: string | null;
};

type Props = {
  rows: StagingRow[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  statusFilter: string;
  orgs: OrgOption[];
};

// ── Shared classes (matches AdminTables.tsx) ────────────────────────────────────

const thCls =
  'px-4 py-2.5 text-left text-caption font-semibold text-muted uppercase tracking-wider whitespace-nowrap select-none';
const tdCls = 'px-4 py-3 text-body-sm align-middle';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function payloadStr(p: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function statusBadge(status: string) {
  if (status === 'pending')
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-[#FEF3C7] text-[#92400E]">
        Pending
      </span>
    );
  if (status === 'merged')
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-success-light text-success">
        Promoted
      </span>
    );
  if (status === 'rejected')
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-background text-muted border border-border">
        Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold bg-background text-muted">
      {status}
    </span>
  );
}

// ── SearchInput ──────────────────────────────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
        placeholder="Search by name…"
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

// ── PaginationBar ────────────────────────────────────────────────────────────────

function PaginationBar({
  page, pageCount, pageSize, total, start,
  setPage, setPageSize,
}: {
  page: number; pageCount: number; pageSize: number; total: number; start: number;
  setPage: (p: number) => void; setPageSize: (s: number) => void;
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
        >←</button>
        <span className="text-caption text-muted tabular-nums select-none">{page}/{pageCount}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page >= pageCount}
          className="h-7 w-7 rounded border border-border bg-background text-caption flex items-center justify-center hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          aria-label="Next page"
        >→</button>
      </div>
    </div>
  );
}

// ── PromoteForm ──────────────────────────────────────────────────────────────────

function PromoteForm({
  rowId,
  orgs,
  hasNoExternalRef,
  onDone,
  onCancel,
}: {
  rowId: string;
  orgs: OrgOption[];
  hasNoExternalRef: boolean;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  function submit() {
    if (!orgId) { setErr('Select an organization'); return; }
    setErr('');
    startTransition(async () => {
      try {
        const result = await adminPromoteStagingVenue(rowId, orgId);
        onDone(result.alreadyExisted ? 'Linked to existing venue (duplicate places_id).' : 'Venue promoted successfully.');
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Promotion failed');
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 min-w-[220px]">
      {hasNoExternalRef && (
        <p className="text-caption text-[#92400E] bg-[#FEF3C7] px-2 py-1 rounded">
          No places_id — photo sync won&apos;t auto-run
        </p>
      )}
      <select
        value={orgId}
        onChange={(e) => setOrgId(e.target.value)}
        className="h-8 rounded border border-border bg-background text-body-sm px-2 focus:ring-1 focus:ring-brand focus:outline-none"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      {err && <p className="text-caption text-error">{err}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="h-7 px-3 rounded bg-brand text-white text-caption font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isPending ? 'Promoting…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── RejectForm ───────────────────────────────────────────────────────────────────

function RejectForm({
  rowId,
  onDone,
  onCancel,
}: {
  rowId: string;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  function submit() {
    setErr('');
    startTransition(async () => {
      try {
        await adminRejectStagingVenue(rowId, reason || undefined);
        onDone('Venue rejected.');
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Rejection failed');
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 min-w-[220px]">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="h-8 rounded border border-border bg-background text-body-sm px-2 placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
      />
      {err && <p className="text-caption text-error">{err}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="h-7 px-3 rounded bg-error text-white text-caption font-medium hover:opacity-80 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isPending ? 'Rejecting…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="h-7 px-3 rounded border border-border bg-background text-caption text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────────

function StagingRow({
  row,
  orgs,
}: {
  row: StagingRow;
  orgs: OrgOption[];
}) {
  const [action, setAction] = useState<'promote' | 'reject' | null>(null);
  const [toast, setToast] = useState('');

  const p = row.payload;
  const name = payloadStr(p, 'name', 'title') || '(unnamed)';
  const category = payloadStr(p, 'categoryName', 'category', 'primaryType');
  const city = payloadStr(p, 'city');
  const state = payloadStr(p, 'state');
  const thumbnailUrl = payloadStr(p, 'thumbnail_url', 'imageUrl');
  const rating = typeof p.rating === 'number' ? p.rating : typeof p.totalScore === 'number' ? p.totalScore : null;
  const tags: string[] = Array.isArray(p.tags) ? (p.tags as string[]) : [];
  const hasInstagram = !!(p.instagram_url || (Array.isArray((p.socials as any)?.instagram) && (p.socials as any).instagram.length));
  const hasFacebook = !!(p.facebook_url || (Array.isArray((p.socials as any)?.facebook) && (p.socials as any).facebook.length));
  const hasTiktok = !!(p.tiktok_url || (Array.isArray((p.socials as any)?.tiktok) && (p.socials as any).tiktok.length));
  const hasWebsite = !!payloadStr(p, 'website');

  const isPending = row.status === 'pending';

  function handleDone(msg: string) {
    setAction(null);
    setToast(msg);
  }

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-background/40 transition-colors align-top">
        {/* Thumbnail */}
        <td className={tdCls}>
          <div className="w-12 h-12 rounded-md overflow-hidden bg-background border border-border flex items-center justify-center shrink-0">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-muted-light text-caption">—</span>
            )}
          </div>
        </td>

        {/* Name + category */}
        <td className={tdCls}>
          <div className="font-medium text-foreground leading-snug">{name}</div>
          {category && <div className="text-caption text-muted mt-0.5">{category}</div>}
          {!row.external_ref && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0 text-caption bg-[#FEF3C7] text-[#92400E] mt-1">
              no places_id
            </span>
          )}
        </td>

        {/* Address */}
        <td className={tdCls}>
          <span className="text-muted whitespace-nowrap">
            {[city, state].filter(Boolean).join(', ') || '—'}
          </span>
        </td>

        {/* Rating */}
        <td className={tdCls}>
          {rating !== null ? (
            <span className="text-foreground">{rating.toFixed(1)}</span>
          ) : (
            <span className="text-muted-light">—</span>
          )}
        </td>

        {/* Tags */}
        <td className={tdCls}>
          {tags.length === 0 ? (
            <span className="text-muted-light">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((t) => (
                <span key={t} className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-background border border-border text-muted">
                  {t}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="text-caption text-muted-light">+{tags.length - 3}</span>
              )}
            </div>
          )}
        </td>

        {/* Socials */}
        <td className={tdCls}>
          <div className="flex items-center gap-1.5">
            {hasInstagram && <span className="text-caption text-muted" title="Instagram">IG</span>}
            {hasFacebook && <span className="text-caption text-muted" title="Facebook">FB</span>}
            {hasTiktok && <span className="text-caption text-muted" title="TikTok">TT</span>}
            {hasWebsite && <span className="text-caption text-muted" title="Website">WEB</span>}
            {!hasInstagram && !hasFacebook && !hasTiktok && !hasWebsite && (
              <span className="text-muted-light">—</span>
            )}
          </div>
        </td>

        {/* Status */}
        <td className={tdCls}>{statusBadge(row.status)}</td>

        {/* Added */}
        <td className={`${tdCls} whitespace-nowrap text-muted`}>
          {relativeTime(row.created_at)}
        </td>

        {/* Actions */}
        <td className={`${tdCls} whitespace-nowrap`}>
          {action === null ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/staging/${row.id}`}
                className="text-brand font-semibold text-caption whitespace-nowrap hover:text-brand-dark transition-colors"
              >
                View
              </Link>
              {isPending && (
                <>
                  <button
                    type="button"
                    onClick={() => setAction('promote')}
                    className="text-caption font-semibold text-success hover:opacity-80 transition-colors cursor-pointer"
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction('reject')}
                    className="text-caption font-semibold text-error hover:opacity-80 transition-colors cursor-pointer"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          ) : null}
        </td>
      </tr>

      {/* Inline action row */}
      {action !== null && (
        <tr className="border-b border-border bg-background/60">
          <td colSpan={9} className="px-4 py-3">
            {toast && (
              <p className="text-caption text-success font-medium mb-2">{toast}</p>
            )}
            {action === 'promote' && (
              <PromoteForm
                rowId={row.id}
                orgs={orgs}
                hasNoExternalRef={!row.external_ref}
                onDone={handleDone}
                onCancel={() => setAction(null)}
              />
            )}
            {action === 'reject' && (
              <RejectForm
                rowId={row.id}
                onDone={handleDone}
                onCancel={() => setAction(null)}
              />
            )}
          </td>
        </tr>
      )}

      {/* Toast row (after action closed) */}
      {action === null && toast && (
        <tr className="border-b border-border">
          <td colSpan={9} className="px-4 py-2 bg-success-light">
            <p className="text-caption text-success font-medium">{toast}</p>
          </td>
        </tr>
      )}
    </>
  );
}

// ── StagingTable ─────────────────────────────────────────────────────────────────

export default function StagingTable({
  rows, total, page, pageSize, q, statusFilter, orgs,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [localQ, setLocalQ] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushParams = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { page: String(page), pageSize: String(pageSize), q, status: statusFilter, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [page, pageSize, q, statusFilter, router, pathname]);

  const onSearchChange = useCallback((v: string) => {
    setLocalQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ q: v, page: '1' });
    }, 350);
  }, [pushParams]);

  useEffect(() => { setLocalQ(q); }, [q]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'merged', label: 'Promoted' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput value={localQ} onChange={onSearchChange} />
        <div className="flex items-center gap-1">
          {STATUS_OPTIONS.map((o) => {
            const active = statusFilter === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => pushParams({ status: o.value, page: '1' })}
                className={`h-7 px-2.5 rounded-md text-caption font-medium border transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-muted border-border hover:border-muted'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <span className="text-caption text-muted ml-auto tabular-nums">
          {total} venue{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body-md font-semibold text-foreground mb-1">No venues found</p>
            <p className="text-body-sm text-muted">
              {q ? `No results for &ldquo;${q}&rdquo;` : 'Nothing in this status filter.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className={thCls}>Img</th>
                    <th className={thCls}>Name</th>
                    <th className={thCls}>Location</th>
                    <th className={thCls}>Rating</th>
                    <th className={thCls}>Tags</th>
                    <th className={thCls}>Socials</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}>Added</th>
                    <th className={thCls}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <StagingRow key={row.id} row={row as StagingRow} orgs={orgs} />
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              total={total}
              start={start}
              setPage={(p) => pushParams({ page: String(p) })}
              setPageSize={(s) => pushParams({ pageSize: String(s), page: '1' })}
            />
          </>
        )}
      </div>
    </div>
  );
}
