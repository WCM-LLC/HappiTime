import ConfirmDeleteForm from '@/components/ConfirmDeleteForm';
import {
  cancelOrgInvite,
  createOrgInvite,
  removeMember,
  updateMemberAccess,
} from '@/actions/access-actions';
import type { VenueSummary as VenueRow } from '@happitime/shared-api';

/**
 * AccessManager — the team/access management UI (invite staff, pending
 * invites, current members). Extracted from the standalone
 * /orgs/[orgId]/access route so it can also be embedded in the venue
 * dashboard's "Team" tab. Presentational only — callers own auth,
 * data-fetching, and the page header/error banner.
 */

export type MemberRow = {
  user_id: string;
  role: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type InviteRow = {
  id: string;
  email: string;
  role: string;
  venue_ids: string[] | null;
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  first_name: string | null;
  last_name: string | null;
};

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

export default function AccessManager({
  orgId,
  membershipRole,
  venueRows,
  memberRows,
  inviteRows,
  assignmentsByUser,
  venueNameById,
}: {
  orgId: string;
  membershipRole: string;
  venueRows: VenueRow[];
  memberRows: MemberRow[];
  inviteRows: InviteRow[];
  assignmentsByUser: Map<string, string[]>;
  venueNameById: Map<string, string>;
}) {
  return (
    <>
      {/* ══════════════════════════════════════════════
          SECTION 1 — INVITE STAFF
      ══════════════════════════════════════════════ */}
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm mb-8">
        <div className="mb-5">
          <h3 className="text-heading-sm font-semibold text-foreground">Invite staff</h3>
          <p className="text-body-sm text-muted mt-0.5">Send an email invitation with a role and optional venue assignments.</p>
        </div>

        <form className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-first-name" className="text-body-sm font-medium text-foreground block mb-1.5">
                First name
              </label>
              <input id="inv-first-name" name="first_name" type="text" placeholder="Jane" className={inputCls} />
            </div>
            <div>
              <label htmlFor="inv-last-name" className="text-body-sm font-medium text-foreground block mb-1.5">
                Last name
              </label>
              <input id="inv-last-name" name="last_name" type="text" placeholder="Doe" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-email" className="text-body-sm font-medium text-foreground block mb-1.5">
                Email
              </label>
              <input id="inv-email" name="email" type="email" placeholder="user@example.com" required className={inputCls} />
            </div>
            <div>
              <label htmlFor="inv-role" className="text-body-sm font-medium text-foreground block mb-1.5">
                Role
              </label>
              <select id="inv-role" name="role" defaultValue="manager" className={selectCls}>
                <option value="manager">Manager</option>
                <option value="host">Host</option>
                {membershipRole === 'owner' ? <option value="owner">Owner</option> : null}
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
          <h3 className="text-heading-sm font-semibold text-foreground">Pending invites</h3>
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
                      <p className="text-body-sm font-semibold text-foreground">{[invite.first_name, invite.last_name].filter(Boolean).join(' ') || invite.email}</p>
                      <p className="text-caption text-muted">{invite.email}</p>
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
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5">
          <h3 className="text-heading-sm font-semibold text-foreground">Current members</h3>
          <p className="text-body-sm text-muted mt-0.5">Update roles and venue assignments for existing staff.</p>
        </div>

        {memberRows.length ? (
          <div className="flex flex-col gap-4">
            {memberRows.map((member) => {
              const label = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || member.user_id;
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
    </>
  );
}
