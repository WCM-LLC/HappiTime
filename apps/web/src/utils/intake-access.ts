import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isAdminEmail } from '@/utils/admin-emails';
import { createServiceClient } from '@/utils/supabase/server';
import { sendIntakeReviewNotice } from '@/utils/email';

export type IntakeTier = 'admin' | 'owner' | 'super_user';

/**
 * Two different questions, two different role sets.
 *
 * SCAN: who may photograph a menu for their org's venues — mirrors
 * menus_write_org_editors, so anyone already trusted to edit menus.
 *
 * APPROVE: who may put a scan live without anyone else looking. Deliberately
 * narrower. An editor is often the newest person you added, and their scan
 * publishes to a public listing, so an editor's scan queues for an owner or
 * admin instead. The same set decides who may action a queue.
 */
export const INTAKE_SCAN_ROLES = ['owner', 'admin', 'editor'];
export const INTAKE_APPROVE_ROLES = ['owner', 'admin'];

/** Owner/super-tier daily extract cap (Gemini free tier is 1,500/day; 10/user keeps 50 active users well clear). */
export const INTAKE_DAILY_EXTRACT_CAP = 10;

export function isSelfServeIntakeEnabled(): boolean {
  return process.env.INTAKE_SELF_SERVE_ENABLED === 'true';
}

/**
 * Resolves the caller's intake tier (Fix 4 + super-user addendum):
 *   admin      → full access, unchanged behavior
 *   owner      → org owner/admin/editor of at least one org; own venues only,
 *                publishes without review (scanning IS their approval)
 *   super_user → any published venue; always draft + review queue, routed to
 *                the venue's org when it has one (see resolveReviewRoute)
 * Non-admin tiers exist only when INTAKE_SELF_SERVE_ENABLED=true.
 * Returns null when the caller may not use intake at all.
 */
export async function getIntakeTier(
  supabase: SupabaseClient,
  user: User,
): Promise<IntakeTier | null> {
  if (await isAdminEmail(user.email)) return 'admin';
  if (!isSelfServeIntakeEnabled()) return null;

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .in('role', INTAKE_SCAN_ROLES)
    .limit(1)
    .maybeSingle();
  if (membership) return 'owner';

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if ((profile as { role?: string | null } | null)?.role === 'super_user') return 'super_user';

  return null;
}

/**
 * Server-side venue-scope check for non-admin tiers (never trust the picker):
 * owner tier must belong to the venue's org with an intake role; super_user
 * tier may target any published venue.
 */
export async function canUseIntakeForVenue(
  supabase: SupabaseClient,
  user: User,
  tier: IntakeTier,
  venueId: string,
): Promise<boolean> {
  if (tier === 'admin') return true;
  const db = createServiceClient();
  const { data: venue } = await db
    .from('venues')
    .select('org_id, status')
    .eq('id', venueId)
    .maybeSingle();
  if (!venue) return false;
  if (tier === 'super_user') return venue.status === 'published';
  if (!venue.org_id) return false;
  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', venue.org_id)
    .eq('user_id', user.id)
    .in('role', INTAKE_SCAN_ROLES)
    .maybeSingle();
  return membership != null;
}

/**
 * May this caller put a scan of THIS venue live without a second pair of eyes?
 *
 * Admins always. Org owners and admins for their own venues. Editors never —
 * they can scan, but their commit becomes a draft their org approves. Super
 * users never, on any venue.
 */
export async function canPublishIntakeForVenue(
  supabase: SupabaseClient,
  user: User,
  tier: IntakeTier,
  venueId: string,
): Promise<boolean> {
  if (tier === 'admin') return true;
  if (tier === 'super_user') return false;

  const { data: venue } = await createServiceClient()
    .from('venues')
    .select('org_id')
    .eq('id', venueId)
    .maybeSingle();
  const orgId = (venue as { org_id?: string | null } | null)?.org_id ?? null;
  if (!orgId) return false;

  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .in('role', INTAKE_APPROVE_ROLES)
    .maybeSingle();
  return data != null;
}

export type ReviewRoute =
  | { route: 'owner'; orgId: string }
  | { route: 'admin'; orgId: null };

/**
 * Where a super user's scan goes for approval. The venue's own people get
 * first refusal: if the venue belongs to an org that has anyone able to act
 * on it, the submission is theirs. Only ownerless venues (or orgs with no
 * member in an intake role) fall through to the HappiTime admin queue.
 *
 * Owner-tier scans never reach here — they self-approve at commit time.
 */
export async function resolveReviewRoute(venueId: string): Promise<ReviewRoute> {
  const db = createServiceClient();
  const { data: venue } = await db
    .from('venues')
    .select('org_id')
    .eq('id', venueId)
    .maybeSingle();
  const orgId = (venue as { org_id?: string | null } | null)?.org_id ?? null;
  if (!orgId) return { route: 'admin', orgId: null };

  const { data: reviewer } = await db
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', INTAKE_APPROVE_ROLES)
    .limit(1)
    .maybeSingle();
  return reviewer ? { route: 'owner', orgId } : { route: 'admin', orgId: null };
}

/** True when the caller holds an intake role in this specific org. */
export async function isOrgIntakeReviewer(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .in('role', INTAKE_APPROVE_ROLES)
    .maybeSingle();
  return data != null;
}

/**
 * Email addresses to notify when a submission lands in an org's queue.
 * org_members.email is the fast path; anyone missing one is resolved through
 * the auth admin API so a member who joined by invite still gets told.
 */
export async function orgReviewerEmails(orgId: string): Promise<string[]> {
  const db = createServiceClient();
  const { data: members } = await db
    .from('org_members')
    .select('user_id, email')
    .eq('org_id', orgId)
    .in('role', INTAKE_APPROVE_ROLES);

  const rows = (members ?? []) as { user_id: string; email: string | null }[];
  const emails = new Set<string>();
  const missing: string[] = [];
  for (const m of rows) {
    if (m.email) emails.add(m.email);
    else missing.push(m.user_id);
  }
  for (const userId of missing) {
    const { data } = await db.auth.admin.getUserById(userId);
    if (data?.user?.email) emails.add(data.user.email);
  }
  return [...emails];
}

/**
 * Base URL for links we email out, mirroring the commit route's resolution.
 *
 * The last-resort default must be a host that actually serves the console.
 * `console.happitime.biz` resolves to Vercel but is attached to no project, so
 * it answers DEPLOYMENT_NOT_FOUND — a reviewer who got that link would be told
 * a scan needs approval and then handed a 404. Every other console link in the
 * repo (email.ts, auth-redirects.ts, the directory's auth callback, both
 * .env.example files) falls back to the vercel.app host, so this matches them
 * rather than inventing a fourth answer.
 *
 * Set NEXT_PUBLIC_CONSOLE_URL to override; if console.happitime.biz is ever
 * pointed at the console project, that env var is the place to say so.
 */
function consoleOrigin(): string {
  const origin =
    process.env.NEXT_PUBLIC_CONSOLE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://happitime-console.vercel.app';
  return origin.replace(/\/$/, '');
}

/**
 * Emails whoever now owns this approval. Best-effort by design: the commit
 * already succeeded and the submission row is written, so a mail failure is
 * logged and swallowed rather than surfaced to the scanner.
 */
export async function notifyIntakeReviewers(params: {
  route: 'owner' | 'admin';
  orgId: string | null;
  venueName: string;
}): Promise<void> {
  try {
    const to =
      params.route === 'owner' && params.orgId
        ? await orgReviewerEmails(params.orgId)
        : (process.env.ADMIN_EMAILS ?? '')
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean);
    const reviewUrl =
      params.route === 'owner' && params.orgId
        ? `${consoleOrigin()}/orgs/${params.orgId}/intake-review`
        : `${consoleOrigin()}/admin/intake-review`;
    await sendIntakeReviewNotice({ to, venueName: params.venueName, reviewUrl });
  } catch (err) {
    console.error('[intake] reviewer notification failed:', err);
  }
}

/** Start of the current service day in KC time, as an ISO string for range queries. */
export function serviceDayStartIso(now = new Date()): string {
  const kc = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const offsetMs = now.getTime() - kc.getTime();
  kc.setHours(0, 0, 0, 0);
  return new Date(kc.getTime() + offsetMs).toISOString();
}

/** Returns extracts used today (KC service day) by this user. */
export async function extractsUsedToday(userId: string): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from('intake_extract_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', serviceDayStartIso());
  return count ?? 0;
}
