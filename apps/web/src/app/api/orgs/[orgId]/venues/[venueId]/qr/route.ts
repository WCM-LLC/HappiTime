import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import { SIZE_PRESETS, renderVenueQrPng } from '@happitime/venue-qr';

// pngjs needs Node APIs — must run on the Node.js runtime, not edge.
export const runtime = 'nodejs';

// Mirrors the venue page's canManageVenue check (owner/manager/admin/editor + platform admin).
const MANAGE_ROLES = new Set(['manager', 'admin', 'editor']);

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ orgId: string; venueId: string }> },
) {
  const { orgId, venueId } = await ctx.params;
  const preset = new URL(_req.url).searchParams.get('size') ?? 'postcard';

  if (!Object.prototype.hasOwnProperty.call(SIZE_PRESETS, preset)) {
    return NextResponse.json({ error: 'Invalid size preset' }, { status: 400 });
  }

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userIsAdmin = await isAdminEmail(user.email);
  const { data: membership } = await authClient
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = String(membership?.role ?? '');
  const canManage = userIsAdmin || role === 'owner' || MANAGE_ROLES.has(role);
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Admins read via service role (cross-org). Resolve slug directly — fetchVenueById
  // does not select `slug`. Scoping by org_id makes an out-of-org venue a clean 404.
  const db = userIsAdmin ? createServiceClient() : authClient;
  const { data: venue, error } = await db
    .from('venues')
    .select('slug')
    .eq('id', venueId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Venue lookup failed' }, { status: 500 });
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
  if (!venue.slug) return NextResponse.json({ error: 'Venue has no slug' }, { status: 422 });

  const png = await renderVenueQrPng(venue.slug, {
    size: SIZE_PRESETS[preset as keyof typeof SIZE_PRESETS].px,
  });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${venue.slug}-qr-${preset}.png"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
