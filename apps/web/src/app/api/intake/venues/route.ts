import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { getIntakeTier } from '@/utils/intake-access';

export const runtime = 'nodejs';

/**
 * Tier-scoped venue search for the intake capture picker. The browser client
 * can't serve this: venue RLS is org-scoped, so super users would see nothing.
 *   admin      → all venues
 *   owner      → venues in orgs where they hold an intake role
 *   super_user → published venues only
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const tier = await getIntakeTier(supabase, user);
  if (!tier) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ venues: [] });

  const db = createServiceClient();
  let query = db
    .from('venues')
    .select('id, name, address, city')
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(8);

  if (tier === 'super_user') {
    query = query.eq('status', 'published');
  } else if (tier === 'owner') {
    const { data: memberships } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin', 'editor']);
    const orgIds = [...new Set((memberships ?? []).map((m) => m.org_id))];
    if (orgIds.length === 0) return NextResponse.json({ venues: [] });
    query = query.in('org_id', orgIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[intake/venues]', error);
    return NextResponse.json({ error: 'search_failed' }, { status: 500 });
  }
  return NextResponse.json({ venues: data ?? [] });
}
