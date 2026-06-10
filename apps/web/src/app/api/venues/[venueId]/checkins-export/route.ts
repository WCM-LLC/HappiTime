import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';

export const runtime = 'nodejs';

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

  // ── 2. Resolve venue → org_id via service-role ─────────────────────────────
  const svc = createServiceClient();
  const { data: venue, error: venueErr } = await svc
    .from('venues')
    .select('id, org_id')
    .eq('id', venueId)
    .maybeSingle();

  if (venueErr || !venue) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
  }

  // ── 3. Authorize: org member or platform admin ─────────────────────────────
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

  // ── 4. Fetch data (service-role; checkins + attribution events are RLS-locked) ─
  const [
    { data: checkins },
    { data: attributions },
    { data: redemptions },
  ] = await Promise.all([
    svc
      .from('checkins')
      .select('id,user_id,method,service_date,lat,lng,created_at')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false }),
    svc
      .from('venue_attribution_events')
      .select('id,source,user_id,created_at')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false }),
    svc
      .from('round_redemptions')
      .select('id,user_id,checkins_consumed,confirmed_with_code,created_at')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false }),
  ]);

  // ── 5. Build CSV ───────────────────────────────────────────────────────────
  function escapeCSV(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const rows: string[] = [];

  // Section: check-ins
  rows.push('# CHECK-INS');
  rows.push(['id', 'user_id', 'method', 'service_date', 'lat', 'lng', 'created_at'].join(','));
  for (const r of checkins ?? []) {
    rows.push(
      [r.id, r.user_id, r.method, r.service_date, r.lat, r.lng, r.created_at]
        .map(escapeCSV)
        .join(','),
    );
  }

  // Section: attribution events
  rows.push('');
  rows.push('# ATTRIBUTION_EVENTS');
  rows.push(['id', 'source', 'user_id', 'created_at'].join(','));
  for (const r of attributions ?? []) {
    rows.push(
      [r.id, r.source, r.user_id, r.created_at].map(escapeCSV).join(','),
    );
  }

  // Section: round redemptions
  rows.push('');
  rows.push('# ROUND_REDEMPTIONS');
  rows.push(['id', 'user_id', 'checkins_consumed', 'confirmed_with_code', 'created_at'].join(','));
  for (const r of redemptions ?? []) {
    rows.push(
      [r.id, r.user_id, r.checkins_consumed, r.confirmed_with_code, r.created_at]
        .map(escapeCSV)
        .join(','),
    );
  }

  const csv = rows.join('\n');
  const today = new Date().toISOString().slice(0, 10);
  const filename = `checkins-${venueId.slice(0, 8)}-${today}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
