import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import ConfirmDeleteForm from '@/components/ConfirmDeleteForm';
import { createClient } from '@/utils/supabase/server';
import {
  cancelOrgInvite,
  createOrgInvite,
  removeMember,
  updateMemberAccess,
} from '@/actions/access-actions';

type VenueRow = {
  id: string;
  name: string;
};

type MemberRow = {
  user_id: string;
  role: string;
  email: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  venue_ids: string[] | null;
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
};

type AssignmentRow = {
  venue_id: string;
  user_id: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Please enter a valid email address.',
  invalid_role: 'Please select a valid role.',
  invite_exists: 'An active invite already exists for that email.',
  invite_create_failed: 'Unable to create invite.',
  invite_email_failed: 'Unable to send invite email.',
  invite_cancel_failed: 'Unable to cancel invite.',
  member_not_found: 'Member not found.',
  member_role_update_failed: 'Unable to update member role.',
  assignments_lookup_failed: 'Unable to load assignments.',
  assignments_add_failed: 'Unable to assign venues.',
  assignments_remove_failed: 'Unable to remove venue assignments.',
  member_delete_failed: 'Unable to remove member.',
  member_assignments_delete_failed: 'Unable to remove member assignments.',
  cannot_edit_self: 'You cannot edit your own role here.',
  cannot_remove_self: 'You cannot remove yourself.',
  cannot_edit_owner: 'Owner role cannot be edited.',
  cannot_remove_owner: 'Owner cannot be removed.',
  invalid_venues: 'One or more venues were invalid.',
  venue_lookup_failed: 'Unable to validate venues.',
  missing_service_role_key: 'Missing server credentials for invitations.',
  invalid_service_role_key: 'Invalid server credentials for invitations. Check SUPABASE_SERVICE_ROLE_KEY.',
};

/* ── Shared styles ── */
const inputCls =
  'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';
const selectCls =
  'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors appearance-none';
const btnPrimary =
  'inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer';
const btnSecondary =
  'inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer';
const btnDanger =
  'inline-flex items-center justify-center h-9 px-3 rounded-md text-body-sm font-medium text-error hover:bg-error-light border border-border transition-colors cursor-pointer';

export default async function OrgAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ error?: string; error_detail?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const pageError = sp?.error;
  const errorDetail = process.env.NODE_ENV === 'development' ? sp?.error_detail : null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">Not authenticated.</p>
      </div>
    );
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const isOwner = String(membership?.role ?? '') === 'owner';

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-background">
        <UserBar />
        <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Not authorized</p>
            <p className="text-body-sm text-error/80 mt-0.5">Only organization owners can manage access.</p>
          </div>
          <Link href={`/orgs/${orgId}`}>
            <span className={btnSecondary}>&larr; Back to organization</span>
          </Link>
        </main>
      </div>
    );
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id,name')
    .eq('id', orgId)
    .maybeSingle();

  const { data: venues } = await supabase
    .from('venues')
    .select('id,name')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  const { data: members } = await supabase
    .from('org_members')
    .select('user_id,role,email')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  const { data: assignments } = await supabase
    .from('venue_members')
    .select('venue_id,user_id')
    .eq('org_id', orgId);

  const { data: invites } = await supabase
    .from('org_invites')
    .select('id,email,role,venue_ids,created_at,expires_at,accepted_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const venueRows = (venues as VenueRow[] | null) ?? [];
  const memberRows = (members as MemberRow[] | null) ?? [];
  const inviteRows = (invites as InviteRow[] | null)?.filter((i) => !i.accepted_at) ?? [];
  const assignmentRows = (assignments as AssignmentRow[] | null) ?? [];

  const venueNameById = new Map(venueRows.map((v) => [v.id, v.name]));
  const assignmentsByUser = new Map<string, string[]>();
  for (const row of assignmentRows) {
    const list = assignmentsByUser.get(row.user_id) ?? [];
    list.push(String(row.venue_id));
    assignmentsByUser.set(row.user_id, list);
  }

  const errorMessage = pageError ? ERROR_MESSAGES[pageError] ?? pageError : null;

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* ── Page Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span className="text-muted-light">/</span>
              <Link href={`/orgs/${orgId}`} className="text-body-sm text-muted hover:text-foreground transition-colors">
                {org?.name ?? 'Organization'}
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Manage access</h1>
            <p className="text-body-sm text-muted mt-1">Invite staff, assign roles, and control venue access.</p>
          </div>
          <Link href={`/orgs/${orgId}`}>
            <span className={btnSecondary}>&larr; Back</span>
          </Link>
        </div>

        {/* ── Error Banner ── */}
        {errorMessage ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Action failed</p>
            <p className="text-body-sm text-error/80 mt-0.5">{errorMessage}</p>
            {errorDetail ? <p className="text-caption text-error/60 mt-1">Details: {errorDetail}</p> : null}
          </div>
        ) : null}

        {/* ══════════════════════════════════════════════
            SECTION 1 — INVITE STAFF
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Invite staff</h2>
            <p className="text-body-sm text-muted mt-0.5">Send an email invitation with a role and optional venue assignments.</p>
          </div>

          <form className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="inv-email" className="text-body-sm font-medium text-foreground block mb-1.5">
                  Email
                </label>
                <input
                  id="inv-email"
                  name="email"
                  type="email"
                  placeholder="user@example.com"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="inv-role" className="text-body-sm font-medium text-foreground block mb-1.5">
                  Role
                </label>
                <select id="inv-role" name="role" defaultValue="manager" className={selectCls}>
                  <option value="manager">Manager</option>
                  <option value="host">Host</option>
                </select>
              </div>
            </div>

            {venueRows.length ? (
              <div>
                <p className="text-body-sm font-medium text-foreground mb-2">Assign venues</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {venueRows.map((venue) => (
                    <label key={venue.id} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        name="venue_ids"
                        value={venue.id}
                        className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                      />
                      {venue.name}
                    </label>
                  ))}
                </div>
                <p className="text-caption text-muted mt-2">You can update assignments later.</p>
              </div>
            ) : (
              <p className="text-caption text-muted">No venues yet. Add venues first, then assign them here.</p>
            )}

            <div>
              <button formAction={createOrgInvite.bind(null, orgId)} className={btnPrimary}>
                Send invite
              </button>
            </div>
          </form>
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 2 — PENDING INVITES
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Pending invites</h2>
            <p className="text-body-sm text-muted mt-0.5">Invitations that have been sent but not yet accepted.</p>
          </div>

          {inviteRows.length ? (
            <div className="flex flex-col gap-3">
              {inviteRows.map((invite) => {
                const venuesForInvite =
                  invite.venue_ids?.map((id) => venueNameById.get(id) ?? id).filter(Boolean) ?? [];
                return (
                  <div key={invite.id} className="rounded-lg border border-border bg-background p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-subtle flex items-center justify-center shrink-0">
                        <span className="text-body-sm font-bold text-brand-dark">
                          {invite.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-body-sm font-semibold text-foreground">{invite.email}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-background text-muted border border-border">
                            {invite.role}
                          </span>
                          {venuesForInvite.length ? (
                            <span className="text-caption text-muted">{venuesForInvite.join(', ')}</span>
                          ) : (
                            <span className="text-caption text-muted-light">No venues assigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ConfirmDeleteForm
                      action={cancelOrgInvite.bind(null, orgId, invite.id)}
                      message="Cancel this invite?"
                    >
                      <button className={btnDanger} type="submit">
                        Cancel
                      </button>
                    </ConfirmDeleteForm>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-8 text-center">
              <div className="text-muted-light text-display-md mb-2">&#9993;</div>
              <p className="text-body-sm font-medium text-foreground">No pending invites</p>
              <p className="text-body-sm text-muted mt-1">Invitations you send will appear here until accepted.</p>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 3 — CURRENT MEMBERS
        ══════════════════════════════════════════════ */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
          <div className="mb-5">
            <h2 className="text-heading-sm font-semibold text-foreground">Current members</h2>
            <p className="text-body-sm text-muted mt-0.5">Update roles and venue assignments for existing staff.</p>
          </div>

          {memberRows.length ? (
            <div className="flex flex-col gap-4">
              {memberRows.map((member) => {
                const label = member.email ?? member.user_id;
                const assignedVenueIds = assignmentsByUser.get(member.user_id) ?? [];
                const isMemberOwner = member.role === 'owner';
                const normalizedRole =
                  member.role === 'host' || member.role === 'viewer' ? 'host' : 'manager';

                const roleBadgeColor = isMemberOwner
                  ? 'bg-brand-subtle text-brand-dark'
                  : member.role === 'manager' || member.role === 'admin' || member.role === 'editor'
                    ? 'bg-success-light text-success'
                    : 'bg-background text-muted';

                return (
                  <div key={member.user_id} className="rounded-lg border border-border bg-background">
                    {/* ── Member header ── */}
                    <div className="flex items-center justify-between p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-subtle flex items-center justify-center shrink-0">
                          <span className="text-heading-sm font-bold text-brand-dark">
                            {label.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-body-sm font-semibold text-foreground">{label}</p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium mt-0.5 ${roleBadgeColor}`}>
                            {member.role}
                          </span>
                        </div>
                      </div>

                      {isMemberOwner ? null : (
                        <ConfirmDeleteForm
                          action={removeMember.bind(null, orgId, member.user_id)}
                          message="Remove this member and revoke access?"
                        >
                          <button className={btnDanger} type="submit">
                            Remove
                          </button>
                        </ConfirmDeleteForm>
                      )}
                    </div>

                    {/* ── Member details ── */}
                    {isMemberOwner ? (
                      <div className="border-t border-border px-5 py-4 bg-surface/50">
                        <p className="text-caption text-muted">Owners have full access to all venues.</p>
                      </div>
                    ) : (
                      <div className="border-t border-border px-5 py-5 bg-surface/50">
                        <form className="flex flex-col gap-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-caption font-medium text-muted block mb-1">Role</label>
                              <select name="role" defaultValue={normalizedRole} className={selectCls}>
                                <option value="manager">Manager</option>
                                <option value="host">Host</option>
                              </select>
                            </div>
                          </div>

                          {venueRows.length ? (
                            <div>
                              <p className="text-body-sm font-medium text-foreground mb-2">Assigned venues</p>
                              <div className="flex flex-wrap gap-x-5 gap-y-2">
                                {venueRows.map((venue) => (
                                  <label key={venue.id} className="flex items-center gap-2 text-body-sm text-foreground cursor-pointer">
                                    <input
                                      type="checkbox"
                                      name="venue_ids"
                                      value={venue.id}
                                      defaultChecked={assignedVenueIds.includes(venue.id)}
                                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                                    />
                                    {venue.name}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-caption text-muted">No venues yet.</p>
                          )}

                          <div>
                            <button
                              className={btnSecondary}
                              formAction={updateMemberAccess.bind(null, orgId, member.user_id)}
                            >
                              Save access
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-background/50 p-8 text-center">
              <div className="text-muted-light text-display-md mb-2">&#128101;</div>
              <p className="text-body-sm font-medium text-foreground">No members yet</p>
              <p className="text-body-sm text-muted mt-1">Send an invite above to add your first team member.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
