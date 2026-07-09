'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { promoteToSuperUser, revokeSuperUser, toggleAutoPublish } from '@/actions/admin-user-actions';
import UserAvatar from '@/components/UserAvatar';

export type SuperUserRow = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: 'user' | 'super_user';
  auto_publish_enabled: boolean;
  created_at: string;
  is_public: boolean;
  published_guide_count: number;
  pending_submission_count: number;
  last_submission_at: string | null;
  referees?: number;
  itinerary_saves?: number;
  first_checkins_driven?: number;
  venues_touched?: number;
  redemptions_driven?: number;
};

// Pin the trailing actions column so buttons (Revoke, Make Super User, etc.)
// stay visible when the wide table overflows horizontally instead of scrolling
// off the right edge. Opaque bg keeps scrolled cells from bleeding through; the
// left shadow signals there's more content beneath.
const ACTION_TH = 'px-4 py-2.5 sticky right-0 bg-surface';
const ACTION_TD =
  'px-4 py-3 sticky right-0 z-10 bg-surface shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.10)]';

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

function relativeDate(iso: string | null) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}yr ago`;
}

function avatarFallback(row: Pick<SuperUserRow, 'display_name' | 'handle' | 'email'>) {
  const source = row.display_name ?? row.handle ?? row.email ?? '?';
  return source.charAt(0).toUpperCase();
}

function ConfirmingForm({
  action,
  message,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

export function SuperUsersTable({ rows }: { rows: SuperUserRow[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().replace(/^@/, '');
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.handle ?? '').toLowerCase().includes(q) ||
        (r.display_name ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const superUsers = filtered.filter((r) => r.role === 'super_user');
  const regularUsers = filtered.filter((r) => r.role !== 'super_user');

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by @handle, name, or email..."
          className="flex h-9 w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
        />
        <Link href="/admin/guides?tab=pending">
          <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
            Review submissions
          </span>
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border bg-background/50 flex items-center justify-between">
          <h3 className="text-body-sm font-semibold text-foreground">
            Super Users <span className="text-muted font-normal">({superUsers.length})</span>
          </h3>
        </div>
        {superUsers.length === 0 ? (
          <p className="text-body-sm text-muted p-5">No Super Users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Email</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Auto</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Guides</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Brought</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">First check-ins</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Saves</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden xl:table-cell">Venues</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Last submit</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Created</th>
                  <th className={ACTION_TH} />
                </tr>
              </thead>
              <tbody>
                {superUsers.map((row) => (
                  <tr key={row.user_id} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          url={row.avatar_url}
                          fallback={avatarFallback(row)}
                          sizeClassName="h-9 w-9"
                          textClassName="text-caption font-bold text-brand-dark-alt"
                        />
                        <div>
                          <Link href={`/admin/users/${row.user_id}`} className="font-medium text-foreground hover:text-brand transition-colors">
                            {row.handle ? `@${row.handle}` : row.display_name ?? 'No handle'}
                          </Link>
                          <p className="text-caption text-muted">
                            {row.display_name ?? 'No display name'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted hidden lg:table-cell">{row.email ?? '—'}</td>
                    <td className="px-4 py-3"><Badge role={row.role} /></td>
                    <td className="px-4 py-3">
                      <ConfirmingForm
                        action={toggleAutoPublish}
                        message={`${row.auto_publish_enabled ? 'Disable' : 'Enable'} auto-publish for ${row.handle ? `@${row.handle}` : row.display_name ?? 'this user'}?`}
                      >
                        <input type="hidden" name="user_id" value={row.user_id} />
                        <input type="hidden" name="enabled" value={String(!row.auto_publish_enabled)} />
                        <button
                          type="submit"
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${
                            row.auto_publish_enabled ? 'bg-brand' : 'bg-border-strong'
                          }`}
                          title={row.auto_publish_enabled ? 'Disable auto-publish' : 'Enable auto-publish'}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                              row.auto_publish_enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </ConfirmingForm>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <span className="font-medium text-foreground">{row.published_guide_count}</span> published
                      <span className="block text-caption text-muted-light">
                        {row.pending_submission_count} pending
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted hidden lg:table-cell">
                      <span className="font-medium text-foreground">{row.referees ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-muted hidden lg:table-cell">
                      <span className="font-medium text-foreground">
                        {row.first_checkins_driven !== undefined ? row.first_checkins_driven : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted hidden lg:table-cell">
                      <span className="font-medium text-foreground">{row.itinerary_saves ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-muted hidden xl:table-cell">
                      <span className="font-medium text-foreground">
                        {row.venues_touched !== undefined ? row.venues_touched : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell">{relativeDate(row.last_submission_at)}</td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell">{relativeDate(row.created_at)}</td>
                    <td className={ACTION_TD}>
                      <div className="flex items-center gap-3 justify-end">
                        <Link href={`/admin/users/${row.user_id}`} className="text-caption font-medium text-brand hover:underline">
                          Details
                        </Link>
                        <Link href={`/admin/guides?author=${row.user_id}`} className="text-caption font-medium text-foreground hover:underline">
                          Submissions
                        </Link>
                        <ConfirmingForm
                          action={revokeSuperUser}
                          message={`Revoke Super User access for ${row.handle ? `@${row.handle}` : row.display_name ?? 'this user'}?`}
                        >
                          <input type="hidden" name="user_id" value={row.user_id} />
                          <button
                            type="submit"
                            className="text-caption font-medium text-error hover:underline cursor-pointer disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </ConfirmingForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-background/50">
          <h3 className="text-body-sm font-semibold text-foreground">
            Promote Eligible Users <span className="text-muted font-normal">({regularUsers.length})</span>
          </h3>
        </div>
        {regularUsers.length === 0 ? (
          <p className="text-body-sm text-muted p-5">No users match your filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Email</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-2.5 text-caption font-semibold text-muted uppercase tracking-wider">Joined</th>
                  <th className={ACTION_TH} />
                </tr>
              </thead>
              <tbody>
                {regularUsers.map((row) => (
                  <tr key={row.user_id} className="border-b border-border last:border-0 hover:bg-background/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {row.handle ? `@${row.handle}` : <span className="text-muted-light italic">no handle</span>}
                      </div>
                      <span className="text-caption text-muted">{row.display_name ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell">{row.email ?? '—'}</td>
                    <td className="px-4 py-3"><Badge role={row.role} /></td>
                    <td className="px-4 py-3 text-muted">{relativeDate(row.created_at)}</td>
                    <td className={`${ACTION_TD} text-right`}>
                      <ConfirmingForm
                        action={promoteToSuperUser}
                        message={`Promote ${row.handle ? `@${row.handle}` : row.display_name ?? 'this user'} to Super User?`}
                      >
                        <input type="hidden" name="user_id" value={row.user_id} />
                        <button
                          type="submit"
                          className="text-caption font-medium text-brand hover:underline cursor-pointer disabled:opacity-50"
                        >
                          Make Super User
                        </button>
                      </ConfirmingForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
