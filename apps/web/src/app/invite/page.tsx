import Link from 'next/link';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { acceptOrgInvite, setInvitePassword } from '@/actions/access-actions';

type InviteDetails = {
  id: string;
  email: string;
  role: string;
  venue_ids: string[] | null;
  expires_at: string | null;
  accepted_at: string | null;
  org: { name: string } | null;
};

type RawInviteDetails = Omit<InviteDetails, 'org'> & {
  org: { name: string }[] | { name: string } | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'Missing invite token.',
  invalid_invite: 'Invite not found or already expired.',
  invite_already_used: 'This invite has already been accepted.',
  invite_expired: 'This invite has expired.',
  invite_email_mismatch: 'You are signed in with a different email address.',
  missing_service_role_key: 'Missing server credentials to look up invite.',
  invalid_service_role_key: 'Invalid server credentials to look up invite.',
  password_too_short: 'Password must be at least 8 characters.',
  password_mismatch: 'Passwords do not match.',
  password_set_failed: 'Unable to set your password.',
  invite_accept_failed: 'Unable to accept this invite.',
  invite_user_lookup_failed: 'Unable to look up your account.',
  invite_user_create_failed: 'Unable to create your account.',
  invite_password_login_failed: 'Unable to sign you in after setting a password.',
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/* ── Shared styles ── */
const inputCls =
  'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';
const btnPrimary =
  'inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer';
const btnSecondary =
  'inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-foreground hover:bg-background transition-colors cursor-pointer';

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const token = String(sp?.token ?? '').trim();
  const error = sp?.error;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? error : null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  let invite: InviteDetails | null = null;
  let inviteError: string | null = null;
  let venueNames: Record<string, string> = {};

  if (!token) {
    inviteError = 'Missing invite token.';
  } else {
    const serviceRoleError = getServiceRoleKeyError();
    if (serviceRoleError === 'missing') {
      inviteError = 'Missing server credentials to look up invite.';
    } else if (serviceRoleError === 'invalid') {
      inviteError = 'Invalid server credentials to look up invite. Check SUPABASE_SERVICE_ROLE_KEY.';
    } else {
      const admin = createServiceClient();
      const { data, error: fetchErr } = await admin
        .from('org_invites')
        .select('id,email,role,venue_ids,expires_at,accepted_at,org:organizations ( name )')
        .eq('token', token)
        .maybeSingle();

      if (fetchErr || !data) {
        inviteError = 'Invite not found.';
      } else {
        const raw = data as unknown as RawInviteDetails;
        const org = Array.isArray(raw.org) ? raw.org[0] ?? null : raw.org;
        invite = { ...raw, org };
        const venueIds = Array.isArray(invite.venue_ids) ? invite.venue_ids : [];
        if (venueIds.length) {
          const { data: venues } = await admin
            .from('venues')
            .select('id,name')
            .in('id', venueIds);
          venueNames = Object.fromEntries((venues ?? []).map((v: any) => [String(v.id), String(v.name)]));
        }
      }
    }
  }

  const venueLabels =
    invite?.venue_ids?.map((id) => venueNames[id] ?? id).filter(Boolean) ?? [];
  const inviteEmail = invite?.email ? normalizeEmail(invite.email) : '';
  const userEmail = user?.email ? normalizeEmail(user.email) : '';
  const emailMismatch = Boolean(inviteEmail && userEmail && inviteEmail !== userEmail);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-lg">
        {/* ── Branding ── */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 439 148" className="h-8" aria-label="HappiTime" role="img">
              <circle cx="260.2" cy="74.0" r="47.9" fill="#C8965A" />
              <text x="30" y="93.0" fontFamily="var(--font-display), 'Plus Jakarta Sans', sans-serif" fontWeight="800" fontSize="72" letterSpacing="-0.02em">
                <tspan fill="#1A1A1A">Happ</tspan><tspan fill="#ffffff">iTi</tspan><tspan fill="#1A1A1A">me</tspan>
              </text>
            </svg>
          </Link>
          <h1 className="text-display-sm font-bold text-foreground tracking-tight mt-3">You&apos;re invited</h1>
          <p className="text-body-sm text-muted mt-1">Join your team on HappiTime.</p>
        </div>

        {/* ── Errors ── */}
        {errorMessage ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-4">
            <p className="text-body-sm font-medium text-error">Error</p>
            <p className="text-body-sm text-error/80 mt-0.5">{errorMessage}</p>
          </div>
        ) : null}

        {inviteError ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-4">
            <p className="text-body-sm font-medium text-error">Invite error</p>
            <p className="text-body-sm text-error/80 mt-0.5">{inviteError}</p>
          </div>
        ) : null}

        {/* ── Invite details card ── */}
        {invite ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            {/* Invite summary */}
            <div className="rounded-md border border-border bg-background p-4 mb-5">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <span className="text-caption font-medium text-muted">Organization</span>
                <span className="text-body-sm text-foreground font-medium">{invite.org?.name ?? 'Unknown'}</span>

                <span className="text-caption font-medium text-muted">Role</span>
                <span className="inline-flex items-center">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium bg-brand-subtle text-brand-dark">
                    {invite.role}
                  </span>
                </span>

                <span className="text-caption font-medium text-muted">Email</span>
                <span className="text-body-sm text-foreground">{invite.email}</span>

                {venueLabels.length ? (
                  <>
                    <span className="text-caption font-medium text-muted">Venues</span>
                    <span className="text-body-sm text-foreground">{venueLabels.join(', ')}</span>
                  </>
                ) : (
                  <>
                    <span className="text-caption font-medium text-muted">Venues</span>
                    <span className="text-caption text-muted-light">None assigned yet</span>
                  </>
                )}
              </div>

              {invite.accepted_at ? (
                <p className="text-caption text-success font-medium mt-3">This invite has already been accepted.</p>
              ) : null}
              {invite.expires_at ? (
                <p className="text-caption text-muted mt-2">
                  Expires {new Date(invite.expires_at).toLocaleString()}
                </p>
              ) : null}
            </div>

            {/* ── Actions ── */}
            {invite.accepted_at ? null : emailMismatch ? (
              <div className="rounded-md border border-warning bg-warning-light px-4 py-3">
                <p className="text-body-sm text-warning font-medium">Email mismatch</p>
                <p className="text-body-sm text-warning/80 mt-0.5">
                  You&apos;re signed in as <strong>{user?.email}</strong>. Please log in as <strong>{invite.email}</strong> to accept.
                </p>
              </div>
            ) : user ? (
              <form>
                <input type="hidden" name="token" value={token} />
                <button formAction={acceptOrgInvite} className={btnPrimary + ' w-full'}>
                  Accept invite
                </button>
              </form>
            ) : (
              <form className="flex flex-col gap-4">
                <input type="hidden" name="token" value={token} />

                <div>
                  <label className="text-body-sm font-medium text-foreground block mb-1.5">Email</label>
                  <input type="email" defaultValue={invite.email} disabled className={inputCls + ' opacity-60'} />
                </div>
                <div>
                  <label className="text-body-sm font-medium text-foreground block mb-1.5">Create password</label>
                  <input name="password" type="password" minLength={8} required placeholder="At least 8 characters" className={inputCls} />
                </div>
                <div>
                  <label className="text-body-sm font-medium text-foreground block mb-1.5">Confirm password</label>
                  <input name="password_confirm" type="password" minLength={8} required placeholder="Re-enter your password" className={inputCls} />
                </div>

                <button formAction={setInvitePassword} className={btnPrimary + ' w-full'}>
                  Set password and accept
                </button>

                <p className="text-caption text-muted text-center">
                  Already have access?{' '}
                  <Link href="/login" className="text-brand hover:text-brand-dark transition-colors font-medium">
                    Log in
                  </Link>
                </p>
              </form>
            )}
          </div>
        ) : null}

        {/* ── Home link ── */}
        <div className="text-center mt-4">
          <Link href="/" className="text-body-sm text-muted hover:text-foreground transition-colors">
            &larr; Home
          </Link>
        </div>
      </div>
    </div>
  );
}
