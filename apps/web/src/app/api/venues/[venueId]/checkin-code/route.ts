import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';

// Node runtime: createHmac (via shared-api/src/checkin/code.mjs) needs Node crypto.
export const runtime = 'nodejs';

// Dynamic import of the ESM code module via the package's checkin-code subpath export.
// The .mjs file uses node:crypto (createHmac) which requires the Node runtime.
const { serviceDate, generateCheckinCode } = await import(
  '@happitime/shared-api/checkin-code'
);

/**
 * Compute the ISO timestamp of the next 6:00 AM America/Chicago rotation.
 * The code rotates at 6 AM CT — i.e., 12:00 noon UTC in CDT (UTC−5) or
 * 12:00 noon UTC in CST (UTC−6). Rather than hardcode an offset, we compute
 * "today's 6 AM CT" from the same serviceDate boundary the code uses, then add
 * 24 h if we're already past it.
 */
function nextRotatesAt(now: Date): string {
  // serviceDate(now) gives us the current service day YYYY-MM-DD.
  // The rotation boundary is 6:00 AM CT = end of that service day = start of next.
  // We find the UTC moment that corresponds to "today's service date + 6 AM CT"
  // by iterating: today 6AM CT is midnight UTC + CT offset. Simplest approach:
  // step forward 24 h from the previous 6AM CT boundary.
  //
  // Algorithm: the logical day flips at 6AM CT.
  // "This service day's 6AM CT boundary" = the instant where serviceDate changes
  // when we add 1 second.  We can compute it as:
  //   shifted = now - 6h; localDate = Chicago date of shifted
  //   boundary = localDate @ midnight Chicago + 6h (i.e. local 6AM → UTC 6AM + CT offset)
  //
  // Simplest robust method: find the UTC instant of "6:00 AM America/Chicago today" by
  // binary-searching, or by using Intl.DateTimeFormat parts to get the current
  // CT hour/minute, then subtracting/adding to reach the next 6 AM CT.
  const ctParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);

  const get = (t: string) =>
    Number(ctParts.find((p) => p.type === t)?.value ?? '0');

  const ctHour = get('hour');
  const ctMinute = get('minute');
  const ctSecond = get('second');

  // Seconds since 6 AM CT today (can be negative if before 6 AM)
  const secsSince6am = (ctHour - 6) * 3600 + ctMinute * 60 + ctSecond;
  // ms until next 6 AM CT
  const msUntilNext = secsSince6am >= 0
    ? 86_400_000 - secsSince6am * 1000  // next 6AM is tomorrow
    : -secsSince6am * 1000;              // next 6AM is later today

  return new Date(now.getTime() + msUntilNext).toISOString();
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await ctx.params;

  // ── 1. Authenticate ────────────────────────────────────────────────────────
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Resolve venue → org_id (via service-role so we can read the row
  //       regardless of RLS — auth check is in step 3 against org_members) ──
  const svc = createServiceClient();
  const { data: venue, error: venueErr } = await svc
    .from('venues')
    .select('id, org_id, checkin_secret')
    .eq('id', venueId)
    .maybeSingle();

  if (venueErr || !venue) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
  }

  // ── 3. Authorize: caller must be an org_members row for this venue's org ──
  //       (or a platform admin).  We check org_members via the authed client
  //       (RLS-enforced) so a compromised service-role key can't bypass this.
  const userIsAdmin = await isAdminEmail(user.email);
  if (!userIsAdmin) {
    const { data: membership } = await authClient
      .from('org_members')
      .select('role')
      .eq('org_id', venue.org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // ── 4. Compute code server-side (secret never leaves this handler) ─────────
  const now = new Date();
  const svcDate = serviceDate(now) as string;
  const code = generateCheckinCode(venue.checkin_secret as string, svcDate) as string;
  const rotates_at = nextRotatesAt(now);

  return NextResponse.json(
    { code, service_date: svcDate, rotates_at },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
