import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { authenticateIntakeRequest } from '@/utils/intake-auth';
import {
  getIntakeTier,
  canUseIntakeForVenue,
  canPublishIntakeForVenue,
} from '@/utils/intake-access';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/intake/windows?venue_id=<uuid>
 *
 * Everything the app needs to know about scanning THIS venue:
 *
 * - `windows`: the venue's published happy-hour windows, so a scan can ATTACH
 *   to one instead of creating a duplicate. /api/intake/commit inserts
 *   new_windows[] blind — matching is the client's job, and the app can't do
 *   it from the Supabase client alone (window RLS is org-scoped, so a super
 *   user sees nothing).
 * - `can_publish`: whether this caller's commit goes live or into a review
 *   queue. It is per-VENUE, not per-tier: an org editor and an org owner are
 *   both the 'owner' tier but only one of them publishes. The app reads this
 *   so its submit copy matches what the server will actually do.
 */
export async function GET(req: NextRequest) {
  const caller = await authenticateIntakeRequest(req);
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { supabase, user } = caller;
  const tier = await getIntakeTier(supabase, user);
  if (!tier) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const venueId = req.nextUrl.searchParams.get('venue_id') ?? '';
  if (!UUID_RE.test(venueId)) {
    return NextResponse.json({ error: 'venue_id required (uuid)' }, { status: 400 });
  }
  if (!(await canUseIntakeForVenue(supabase, user, tier, venueId))) {
    return NextResponse.json({ error: 'forbidden_venue' }, { status: 403 });
  }

  const [{ data, error }, canPublish] = await Promise.all([
    createServiceClient()
      .from('happy_hour_windows')
      .select('id, dow, start_time, end_time, label')
      .eq('venue_id', venueId)
      .eq('status', 'published')
      .order('start_time', { ascending: true }),
    canPublishIntakeForVenue(supabase, user, tier, venueId),
  ]);
  if (error) {
    console.error('[intake/windows]', error);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  return NextResponse.json({ windows: data ?? [], can_publish: canPublish });
}
