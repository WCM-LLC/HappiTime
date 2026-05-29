/**
 * POST /api/intake/claim
 *
 * Body: { token: string }
 *
 * Called from the public /claim/[token] page when an owner taps "Publish".
 * Verifies the signed token, then flips the referenced MENU from 'draft' to
 * 'published'. Window-menu join rows already exist from commit and don't have
 * a status column, so the menu's status alone gates consumer visibility.
 *
 * No user auth required: the token IS the authorization.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyIntakeConfirmToken } from '@/utils/intake-token';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : null;
  if (!token) return NextResponse.json({ error: 'token_required' }, { status: 400 });

  const v = verifyIntakeConfirmToken(token);
  if (!v.ok) {
    const status = v.reason === 'expired' ? 410 : 400;
    return NextResponse.json({ error: v.reason }, { status });
  }
  if (getServiceRoleKeyError()) {
    return NextResponse.json({ error: 'service_role_missing' }, { status: 503 });
  }
  const db = createServiceClient();
  const now = new Date().toISOString();

  // Flip the menu to published. We scope the update by venue_id as a belt-and-
  // suspenders check (the signed token already binds them, but extra defense
  // against a maliciously crafted token doesn't hurt).
  const { error: mErr } = await db
    .from('menus')
    .update({ status: 'published', is_active: true })
    .eq('id', v.payload.menu_id)
    .eq('venue_id', v.payload.venue_id);
  if (mErr) {
    return NextResponse.json({ error: 'menu_update_failed', detail: mErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    venue_id: v.payload.venue_id,
    menu_id: v.payload.menu_id,
    published_at: now,
  });
}
