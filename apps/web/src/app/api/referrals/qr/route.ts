import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isAdmin } from '@/utils/admin';
import { SIZE_PRESETS, renderReferralQrPng } from '@happitime/venue-qr';

// Self-only Super User referral QR PNG. The handle is ALWAYS the caller's own
// (forge-proof — no handle param accepted), mirroring record_referral's design.
// pngjs needs Node APIs — must run on the Node.js runtime, not edge.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const preset = url.searchParams.get('size') ?? 'digital';
  const inline = url.searchParams.get('disposition') === 'inline';

  if (!Object.prototype.hasOwnProperty.call(SIZE_PRESETS, preset)) {
    return NextResponse.json({ error: 'Invalid size preset' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('handle, role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String((profile as any)?.role ?? '');
  if (role !== 'super_user' && !(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const handle = String((profile as any)?.handle ?? '').replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(handle)) {
    return NextResponse.json({ error: 'Set a handle in the app first' }, { status: 422 });
  }

  const png = await renderReferralQrPng(handle, {
    size: SIZE_PRESETS[preset as keyof typeof SIZE_PRESETS].px,
  });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': inline
        ? 'inline'
        : `attachment; filename="happitime-${handle}-qr-${preset}.png"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
