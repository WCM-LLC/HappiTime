'use client';

import { useState, useTransition, useMemo } from 'react';
import { promoteToSuperUser, revokeSuperUser, toggleAutoPublish } from '@/actions/admin-user-actions';

export type SuperUserRow = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  role: 'user' | 'super_user';
  auto_publish_enabled: boolean;
  created_at: string;
  is_public: boolean;
};

function Badge({ role }: { role: string }) {
  if (role === 'super_user') {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand-dark-alt">
        super user
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-surface border border-border px-2 py-0.5 text-caption font-medium text-muted">
      user
    </span>
  );
}

function relativeDate(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}yr ago`;
}

export function SuperUsersTable({ rows }: { rows: SuperUserRow[] }) {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.toLowerCase().replace(/^@/, '');
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.handle ?? '').toLowerCase().includes(q) ||
        (r.display_name ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const superUsers = filtered.filter((r) => r.role === 'super_user');
  const regularUsers = filtered.filter((r) => r.role !== 'super_user');

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by @handle or name…"
          className="flex h-9 w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
        />
      </div>

      {/* Super Users */}
      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border bg-background/50 flex items-center justify-between">
          <h3 className="text-body-sm font-semibold text-foreground">
            Super Users{' '}
            <span className="text-muted font-normal">({superUsers.length})</span>
          </h3>
        </div>
        {superUsers.length === 0 ? (
          <p className="text-body-sm text-muted p-5">No super users found.</p>
        ) : (
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Handle</th>
                <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Auto-publish</th>
                <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Joined</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {superUsers.map((row) => (
                <tr key={row.user_id} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {row.handle ? `@${row.handle}` : <span className="text-muted-light italic">no handle</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{row.display_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <form>
                      <input type="hidden" name="user_id" value={row.user_id} />
                      <input type="hidden" name="enabled" value={String(!row.auto_publish_enabled)} />
                      <button
                        formAction={toggleAutoPublish}
                        disabled={isPending}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${
                          row.auto_publish_enabled ? 'bg-brand' : 'bg-border-strong'
                        }`}
                        title={row.auto_publish_enabled ? 'Disable auto-publish' : 'Enable auto-publish'}
                        onClick={() => startTransition(() => {})}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            row.auto_publish_enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-muted">{relativeDate(row.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <form>
                      <input type="hidden" name="user_id" value={row.user_id} />
                      <button
                        formAction={revokeSuperUser}
                        disabled={isPending}
                        className="text-caption font-medium text-error hover:underline cursor-pointer disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Regular Users — promote-eligible */}
      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-background/50">
          <h3 className="text-body-sm font-semibold text-foreground">
            All Users{' '}
            <span className="text-muted font-normal">({regularUsers.length})</span>
          </h3>
        </div>
        {regularUsers.length === 0 ? (
          <p className="text-body-sm text-muted p-5">No users match your filter.</p>
        ) : (
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Handle</th>
                <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Joined</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {regularUsers.map((row) => (
                <tr key={row.user_id} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {row.handle ? `@${row.handle}` : <span className="text-muted-light italic">no handle</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{row.display_name ?? '—'}</td>
                  <td className="px-4 py-3"><Badge role={row.role} /></td>
                  <td className="px-4 py-3 text-muted">{relativeDate(row.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <form>
                      <input type="hidden" name="user_id" value={row.user_id} />
                      <button
                        formAction={promoteToSuperUser}
                        disabled={isPending}
                        className="text-caption font-medium text-brand hover:underline cursor-pointer disabled:opacity-50"
                      >
                        Make Super User
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
