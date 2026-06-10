import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';

export const runtime = 'nodejs';

/**
 * Returns the calendar quarter string "YYYY-Q#" for a UTC instant.
 * Matches the SQL expression used inside ratify_toastmaker:
 *   to_char(date,'YYYY') || '-Q' || extract(quarter from date)
 */
function currentQuarter(date: Date): string {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/**
 * Shared auth gate — mirrors checkin-code/route.ts verbatim:
 *  1. authClient.auth.getUser()  → 401 if unauthenticated
 *  2. service-role read of venues → org_id  → 404 if missing
 *  3. authClient org_members check → 403 if not a member (admins bypass)
 *
 * Returns { user, venue, authClient } on success, or a NextResponse error.
 */
async function authGate(venueId: string): Promise<
  | { ok: true; user: { id: string; email?: string }; venue: { id: string; org_id: string }; authClient: ReturnType<typeof createClient> extends Promise<infer T> ? T : never }
  | { ok: false; response: NextResponse }
> {
  // ── 1. Authenticate ──────────────────────────────────────────────────────
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // ── 2. Resolve venue → org_id via service-role ───────────────────────────
  const svc = createServiceClient();
  const { data: venue, error: venueErr } = await svc
    .from('venues')
    .select('id, org_id')
    .eq('id', venueId)
    .maybeSingle();

  if (venueErr || !venue) {
    return { ok: false, response: NextResponse.json({ error: 'Venue not found' }, { status: 404 }) };
  }

  // ── 3. Authorize: org member or platform admin ───────────────────────────
  const userIsAdmin = await isAdminEmail(user.email);
  if (!userIsAdmin) {
    const { data: membership } = await authClient
      .from('org_members')
      .select('role')
      .eq('org_id', venue.org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
  }

  return { ok: true, user, venue, authClient };
}

// ── GET /api/venues/[venueId]/toastmaker ─────────────────────────────────────
// Returns { nominee, ratified } where:
//   nominee — top eligible nominee shape (or null)
//   ratified — current-quarter venue_toastmakers row (or null)
//
// Org-membership is also enforced inside the RPC (SECURITY DEFINER gate),
// but we apply the same route-level gate for defense-in-depth and consistent
// 401/403 response shapes.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await ctx.params;

  const gate = await authGate(venueId);
  if (!gate.ok) return gate.response;
  const { authClient } = gate;

  // Call toastmaker_nominee with the authed client — the RPC is SECURITY DEFINER
  // and uses auth.uid() internally; the service-role client carries no user JWT.
  const { data: nomineeData, error: nomineeErr } = await (authClient as any).rpc(
    'toastmaker_nominee',
    { p_venue_id: venueId },
  );

  if (nomineeErr) {
    return NextResponse.json({ error: nomineeErr.message }, { status: 500 });
  }

  // Fetch the current-quarter ratified Toastmaker (world-readable table).
  const quarter = currentQuarter(new Date());
  const { data: ratifiedRow, error: ratifiedErr } = await authClient
    .from('venue_toastmakers')
    .select('id, user_id, quarter, ratified_by, created_at')
    .eq('venue_id', venueId)
    .eq('quarter', quarter)
    .maybeSingle();

  if (ratifiedErr) {
    return NextResponse.json({ error: ratifiedErr.message }, { status: 500 });
  }

  // If a ratified row exists, resolve the ratified user's profile so the UI
  // can display the correct @handle / display_name (the ratified user may differ
  // from the current nominee if ratify_toastmaker was called with a custom user_id).
  // user_profiles is RLS-locked → use the service client.
  let ratifiedData = ratifiedRow
    ? ({ ...(ratifiedRow as object), handle: null as string | null, display_name: null as string | null })
    : null;

  if (ratifiedRow) {
    const svc = createServiceClient();
    const { data: prof } = await svc
      .from('user_profiles')
      .select('handle, display_name')
      .eq('user_id', (ratifiedRow as { user_id: string }).user_id)
      .maybeSingle();
    if (prof) {
      ratifiedData = {
        ...(ratifiedRow as object),
        handle: (prof as { handle: string | null }).handle,
        display_name: (prof as { display_name: string | null }).display_name,
      };
    }
  }

  return NextResponse.json(
    { nominee: nomineeData ?? null, ratified: ratifiedData ?? null },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

// ── POST /api/venues/[venueId]/toastmaker ────────────────────────────────────
// Body: { action: 'ratify' | 'pass', user_id?: string }
//   ratify → calls ratify_toastmaker(venueId, user_id); returns { id }
//   pass   → client-side dismissal; no DB write; returns { ok: true, passed: true }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await ctx.params;

  const gate = await authGate(venueId);
  if (!gate.ok) return gate.response;
  const { authClient } = gate;

  let body: { action?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, user_id } = body;

  if (action === 'pass') {
    // Pass is a client-side dismissal; the server acknowledges without a DB write.
    return NextResponse.json({ ok: true, passed: true }, { status: 200 });
  }

  if (action === 'ratify') {
    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required for ratify' }, { status: 400 });
    }

    // Call ratify_toastmaker with the authed client (SECURITY DEFINER, uses auth.uid()).
    const { data: newId, error: ratifyErr } = await (authClient as any).rpc(
      'ratify_toastmaker',
      { p_venue_id: venueId, p_user_id: user_id },
    );

    if (ratifyErr) {
      const status = ratifyErr.message?.includes('not authorized') ? 403 : 500;
      return NextResponse.json({ error: ratifyErr.message }, { status });
    }

    return NextResponse.json({ id: newId }, { status: 200 });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
