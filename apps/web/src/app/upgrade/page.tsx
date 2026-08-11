import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

// Public entry point for pricing-page CTAs: happitime.biz links here so venue
// owners land in the real metadata-carrying checkout instead of a Stripe
// Payment Link (which has no venue_id and forces manual reconciliation).
// Resolves the signed-in owner's venue and forwards to its subscription page;
// ambiguous cases (no org, multiple venues) fall back to the dashboard.
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const sp = await searchParams;
  const plan = sp?.plan === 'featured' || sp?.plan === 'verified' ? sp.plan : null;
  const selfPath = `/upgrade${plan ? `?plan=${plan}` : ''}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(selfPath)}`);

  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id);
  const orgIds = [...new Set((memberships ?? []).map((m) => m.org_id))];
  if (orgIds.length === 0) redirect('/dashboard');

  const { data: venues } = await supabase
    .from('venues')
    .select('id, org_id')
    .in('org_id', orgIds)
    .limit(2);
  if (venues && venues.length === 1) {
    redirect(`/orgs/${venues[0].org_id}/venues/${venues[0].id}/subscription`);
  }
  redirect('/dashboard');
}
