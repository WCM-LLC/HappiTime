import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import { createVenue, deleteVenue } from '../../../actions/organization-actions';
import { fetchVenuesByOrg, type VenueSummary as VenueRow } from '@happitime/shared-api';

export default async function OrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const pageError = sp?.error;
  const fromAdmin = sp?.from === 'admin';

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">Not authenticated.</p>
      </div>
    );
  }

  const userIsAdmin = isAdminEmail(user.email);
  const supabase = (fromAdmin && userIsAdmin) ? createServiceClient() : await createClient();

  const { data: membership } = await (await createClient())
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String(membership?.role ?? '');
  const isOwner = role === 'owner' || (fromAdmin && userIsAdmin);

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id,name')
    .eq('id', orgId)
    .single();

  const { data: venues, error: venuesErr } = await fetchVenuesByOrg(supabase as any, orgId);

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href={fromAdmin ? '/admin' : '/dashboard'} className="text-body-sm text-muted hover:text-foreground transition-colors">
                {fromAdmin ? 'Admin' : 'Dashboard'}
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">
              {orgErr ? 'Organization' : org?.name}
            </h1>
            <p className="text-body-sm text-muted mt-1">Manage venues, locations, and staff access.</p>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && !fromAdmin ? (
              <Link href={`/orgs/${orgId}/access`}>
                <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer">
                  Manage access
                </span>
              </Link>
            ) : null}
            <Link href={fromAdmin ? '/admin' : '/dashboard'}>
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
                &larr; Back
              </span>
            </Link>
          </div>
        </div>

        {/* Error Banner */}
        {pageError ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Error</p>
            <p className="text-body-sm text-error/80 mt-0.5">{pageError}</p>
          </div>
        ) : null}

        {/* Add Venue Form */}
        {isOwner ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
            <div className="mb-4">
              <h2 className="text-heading-sm font-semibold text-foreground">Add a venue</h2>
              <p className="text-body-sm text-muted mt-0.5">
                Add a new location to this organization.
              </p>
            </div>
            <form className="flex flex-col gap-4">
              <div>
                <label htmlFor="venue-name" className="text-body-sm font-medium text-foreground block mb-1.5">
                  Venue name
                </label>
                <input
                  id="venue-name"
                  name="name"
                  placeholder="e.g., Smith's Taproom"
                  required
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="address" className="text-body-sm font-medium text-foreground block mb-1.5">
                    Street address
                  </label>
                  <input
                    id="address"
                    name="address"
                    placeholder="123 Main St"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="city" className="text-body-sm font-medium text-foreground block mb-1.5">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    placeholder="Austin"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="state" className="text-body-sm font-medium text-foreground block mb-1.5">
                    State
                  </label>
                  <input
                    id="state"
                    name="state"
                    placeholder="TX"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="zip" className="text-body-sm font-medium text-foreground block mb-1.5">
                    ZIP code
                  </label>
                  <input
                    id="zip"
                    name="zip"
                    placeholder="78701"
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="timezone" className="text-body-sm font-medium text-foreground block mb-1.5">
                    Timezone
                  </label>
                  <input
                    id="timezone"
                    name="timezone"
                    defaultValue="America/Chicago"
                    className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                  />
                </div>
              </div>
              <div>
                <button
                  formAction={createVenue.bind(null, orgId)}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer"
                >
                  Create venue
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* Venues List */}
        <div>
          <h2 className="text-heading-sm font-semibold text-foreground mb-4">Venues</h2>

          {venuesErr ? (
            <div className="rounded-md border border-error bg-error-light px-4 py-3">
              <p className="text-body-sm font-medium text-error">Database error</p>
              <p className="text-body-sm text-error/80 mt-0.5">{venuesErr.message}</p>
            </div>
          ) : null}

          {(venues as VenueRow[] | null)?.length ? (
            <div className="flex flex-col gap-3">
              {(venues as VenueRow[]).map((v) => {
                const displayName = v.org_name?.trim() || v.name;
                const locationLabel = v.org_name?.trim() && v.org_name !== v.name ? v.name : null;
                const venueHref = fromAdmin
                  ? `/orgs/${orgId}/venues/${v.id}?from=admin`
                  : `/orgs/${orgId}/venues/${v.id}`;
                const statusColor = v.status === 'published'
                  ? 'bg-success-light text-success'
                  : v.status === 'draft'
                    ? 'bg-warning-light text-warning'
                    : 'bg-background text-muted';

                return (
                  <div
                    key={v.id}
                    className="rounded-lg border border-border bg-surface shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md bg-brand-subtle flex items-center justify-center shrink-0">
                          <span className="text-heading-sm font-bold text-brand-dark">
                            {displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-body-md font-semibold text-foreground">{displayName}</h3>
                          {locationLabel ? (
                            <p className="text-caption text-muted">{locationLabel}</p>
                          ) : null}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-body-sm text-muted">
                              {(v.city || v.state) ? `${v.city ?? ''}${v.city && v.state ? ', ' : ''}${v.state ?? ''}` : '—'}
                            </span>
                            {v.status ? (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${statusColor}`}>
                                {v.status}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={venueHref}>
                          <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors cursor-pointer">
                            Manage
                          </span>
                        </Link>
                        {isOwner ? (
                          <form>
                            <input type="hidden" name="venue_id" value={v.id} />
                            <button
                              formAction={deleteVenue.bind(null, orgId)}
                              className="inline-flex items-center justify-center h-9 px-3 rounded-md text-body-sm font-medium text-error hover:bg-error-light border border-border transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 p-12 text-center">
              <div className="text-muted-light text-display-md mb-3">&#127866;</div>
              <p className="text-body-sm font-medium text-foreground">No venues yet</p>
              <p className="text-body-sm text-muted mt-1">
                Add your first venue above to start managing Happy Hours.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
