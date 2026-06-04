import Link from 'next/link';
import { redirect } from 'next/navigation';
import UserBar from '@/components/layout/UserBar';
import AccessManager, { type InviteRow, type MemberRow } from '@/components/venue/AccessManager';
import { createClient } from '@/utils/supabase/server';
import { loginPathFor } from '@/utils/auth-paths';
import { fetchVenuesByOrg, type VenueSummary as VenueRow } from '@happitime/shared-api';

type AssignmentRow = {
  venue_id: string;
  user_id: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  // Invite + member management
  invalid_email: 'Please enter a valid email address.',
  invite_name_required: 'Please provide at least a first or last name.',
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
  not_org_owner: 'Only the organization owner can perform that action.',
  missing_service_role_key: 'Missing server credentials for invitations.',
  invalid_service_role_key: 'Invalid server credentials for invitations. Check SUPABASE_SERVICE_ROLE_KEY.',

  // Admin-only direct staff add/remove (admin-staff-actions.ts)
  staff_name_required: 'Please provide at least a first or last name.',
  staff_invalid_email: 'Please enter a valid email address.',
  staff_password_too_short: 'Password must be at least 8 characters.',
  staff_invalid_role: 'Role must be owner, manager, or host.',
  staff_user_create_failed: "We couldn't create that user. They may already exist with a different password — try resetting it instead.",
  staff_member_add_failed: 'Adding the staff member to this organization failed.',
  staff_venue_assign_failed: 'The user was added to the org, but assigning them to one or more venues failed.',
  staff_missing_user: 'No user was selected for that action.',
  staff_remove_failed: 'Removing the staff member failed.',
};

const btnSecondary =
  'inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer';

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
    redirect(loginPathFor(`/orgs/${orgId}/access`));
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const canManageAccess = ['owner', 'admin'].includes(String(membership?.role ?? ''));

  if (!canManageAccess) {
    return (
      <div className="min-h-screen bg-background">
        <UserBar />
        <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-error">Not authorized</p>
            <p className="text-body-sm text-error/80 mt-0.5">Only organization owners and admins can manage access.</p>
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

  const { data: venues } = await fetchVenuesByOrg(supabase as any, orgId, { order: { column: 'name', ascending: true } });

  const { data: members } = await supabase
    .from('org_members')
    .select('user_id,role,email,first_name,last_name')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  const { data: assignments } = await supabase
    .from('venue_members')
    .select('venue_id,user_id')
    .eq('org_id', orgId);

  const { data: invites } = await supabase
    .from('org_invites')
    .select('id,email,role,venue_ids,created_at,expires_at,accepted_at,first_name,last_name')
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

        <AccessManager
          orgId={orgId}
          membershipRole={String(membership?.role ?? '')}
          venueRows={venueRows}
          memberRows={memberRows}
          inviteRows={inviteRows}
          assignmentsByUser={assignmentsByUser}
          venueNameById={venueNameById}
        />
      </main>
    </div>
  );
}
