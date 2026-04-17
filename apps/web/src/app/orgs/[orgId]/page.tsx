import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { createClient } from '@/utils/supabase/server';
import { createServiceClient } from '@/utils/supabase/server';
import { createVenue, deleteVenue } from '../../../actions/organization-actions';

type VenueRow = {
  id: string;
  name: string;
  org_name: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
};

function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.length === 0 || adminEmails.includes(email.toLowerCase());
}

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
      <main className="container">
        <p>Not authenticated.</p>
      </main>
    );
  }

  const userIsAdmin = isAdminEmail(user.email);
  // Use service role when admin is browsing so RLS doesn't block data
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

  const { data: venues, error: venuesErr } = await supabase
    .from('venues')
    .select('id,name,org_name,city,state,status')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  return (
    <main className="container">
      <div className="col" style={{ gap: 16 }}>
        <UserBar />

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="col" style={{ gap: 4 }}>
            <h2 style={{ marginBottom: 0 }}>
              {orgErr ? 'Organization' : org?.name}
            </h2>
            <div className="muted">Manage locations (venues) and staff access.</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {isOwner && !fromAdmin ? (
              <Link href={`/orgs/${orgId}/access`}>
                <button className="secondary">Manage access</button>
              </Link>
            ) : null}
            {fromAdmin ? (
              <Link href="/admin">
                <button className="secondary">Return to console</button>
              </Link>
            ) : (
              <Link href="/dashboard">
                <button className="secondary">Back</button>
              </Link>
            )}
          </div>
        </div>

        {pageError ? (
          <div className="card error">
            <strong>Error</strong>
            <div className="muted">{pageError}</div>
          </div>
        ) : null}

        {isOwner && !fromAdmin ? (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Add a venue/location</h3>
            <form className="col" style={{ gap: 10 }}>
              <label>
                Venue name
                <input name="name" placeholder="e.g., Smith's Taproom" required />
              </label>
              <div className="row">
                <input name="address" placeholder="Street address (required)" required />
                <input name="city" placeholder="City (required)" required />
              </div>
              <div className="row">
                <input name="state" placeholder="State (required)" required />
                <input name="zip" placeholder="ZIP (required)" required />
              </div>
              <label>
                Timezone
                <input name="timezone" defaultValue="America/Chicago" />
              </label>
              <button formAction={createVenue.bind(null, orgId)}>Create venue</button>
            </form>
          </div>
        ) : null}

        <div className="col" style={{ gap: 12 }}>
          <h3 style={{ marginBottom: 0 }}>Venues</h3>
          {venuesErr ? (
            <div className="card error">
              <strong>DB error</strong>
              <div className="muted">{venuesErr.message}</div>
            </div>
          ) : null}

          {(venues as VenueRow[] | null)?.length ? (
            (venues as VenueRow[]).map((v) => {
              const displayName = v.org_name?.trim() || v.name;
              const locationLabel = v.org_name?.trim() && v.org_name !== v.name ? v.name : null;
              const venueHref = fromAdmin
                ? `/orgs/${orgId}/venues/${v.id}?from=admin`
                : `/orgs/${orgId}/venues/${v.id}`;
              return (
                <div key={v.id} className="card">
                  <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                    <div className="col" style={{ gap: 4 }}>
                      <strong>{displayName}</strong>
                      {locationLabel ? (
                        <span className="muted" style={{ fontSize: 12 }}>{locationLabel}</span>
                      ) : null}
                      <span className="muted">
                        {(v.city || v.state) ? `${v.city ?? ''}${v.city && v.state ? ', ' : ''}${v.state ?? ''}` : '—'}
                        {v.status ? ` · ${v.status}` : ''}
                      </span>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <Link href={venueHref}>
                        <button className="secondary">Manage</button>
                      </Link>
                      {isOwner && !fromAdmin ? (
                        <form>
                          <input type="hidden" name="venue_id" value={v.id} />
                          <button className="secondary" formAction={deleteVenue.bind(null, orgId)}>
                            Delete
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="muted">No venues yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
