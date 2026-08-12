import { NextRequest, NextResponse } from 'next/server';
import { authenticateIntakeRequest } from '@/utils/intake-auth';
import {
  getIntakeTier,
  extractsUsedToday,
  INTAKE_DAILY_EXTRACT_CAP,
  isSelfServeIntakeEnabled,
} from '@/utils/intake-access';

export const runtime = 'nodejs';

/**
 * GET /api/intake/session
 *
 * What may this caller do with intake? The HappiTime app asks on launch so it
 * knows whether to show the "Scan a menu" entry at all, and how many scans are
 * left today. A 200 with tier: null means "signed in, but not for this" — the
 * app hides the feature rather than treating it as an error.
 */
export async function GET(req: NextRequest) {
  const caller = await authenticateIntakeRequest(req);
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { supabase, user } = caller;

  const tier = await getIntakeTier(supabase, user);
  if (!tier) {
    return NextResponse.json({ tier: null, enabled: isSelfServeIntakeEnabled() });
  }

  const used = tier === 'admin' ? 0 : await extractsUsedToday(user.id);
  return NextResponse.json({
    tier,
    enabled: isSelfServeIntakeEnabled(),
    // Whether a commit publishes is deliberately NOT answered here: it is a
    // per-venue question (an org editor and an org owner share this tier but
    // not that right). /api/intake/windows answers it for a chosen venue.
    daily_cap: tier === 'admin' ? null : INTAKE_DAILY_EXTRACT_CAP,
    scans_remaining: tier === 'admin' ? null : Math.max(0, INTAKE_DAILY_EXTRACT_CAP - used),
  });
}
