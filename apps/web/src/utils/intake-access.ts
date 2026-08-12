import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isAdminEmail } from '@/utils/admin-emails';
import { createServiceClient } from '@/utils/supabase/server';

export type IntakeTier = 'admin' | 'owner' | 'super_user';

/** Org roles allowed to scan menus for their venues (mirrors menus_write_org_editors). */
const INTAKE_ORG_ROLES = ['owner', 'admin', 'editor'];

/** Owner/super-tier daily extract cap (Gemini free tier is 1,500/day; 10/user keeps 50 active users well clear). */
export const INTAKE_DAILY_EXTRACT_CAP = 10;

export function isSelfServeIntakeEnabled(): boolean {
  return process.env.INTAKE_SELF_SERVE_ENABLED === 'true';
}

/**
 * Resolves the caller's intake tier (Fix 4 + super-user addendum):
 *   admin      → full access, unchanged behavior
 *   owner      → org owner/admin/editor of at least one org; own venues only
 *   super_user → any published venue; always draft + review queue
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
    .in('role', INTAKE_ORG_ROLES)
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
    .in('role', INTAKE_ORG_ROLES)
    .maybeSingle();
  return membership != null;
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
