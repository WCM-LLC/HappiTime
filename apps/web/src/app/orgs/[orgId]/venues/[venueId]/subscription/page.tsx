import { redirect } from 'next/navigation';
import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';
import { SubscriptionPanel } from '@/components/SubscriptionPanel';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import type { SubscriptionPlan } from '@/utils/stripe';

export default async function SubscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; venueId: string }>;
  searchParams: Promise<{ subscription?: string }>;
}) {
  const { orgId, venueId } = await params;
  const sp = await searchParams;
  const subscriptionResult = sp?.subscription;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect('/login');

  const userIsAdmin = await isAdminEmail(user.email);
  const supabase = userIsAdmin ? createServiceClient() : await createClient();

  // Require owner or manager role
  const { data: membership } = await (await createClient())
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = membership?.role ?? '';
  const canAccess = userIsAdmin || role === 'owner' || role === 'manager';
  if (!canAccess) redirect(`/orgs/${orgId}/venues/${venueId}`);

  // Venue name for breadcrumb
  const { data: venue } = await supabase
    .from('venues')
    .select('name, org_name')
    .eq('id', venueId)
    .single();

  const displayName = venue?.org_name?.trim() || venue?.name || 'Venue';

  // Current subscription
  const { data: venueSub } = await (supabase as any)
    .from('venue_subscriptions')
    .select('plan, status')
    .eq('venue_id', venueId)
    .maybeSingle();

  const currentPlan: SubscriptionPlan =
    venueSub?.status === 'active' || venueSub?.status === 'trialing'
      ? ((['basic', 'featured', 'premium'].includes(venueSub.plan) ? venueSub.plan : 'listed') as SubscriptionPlan)
      : 'listed';

  return (
    <div className="min-h-screen bg-background">
      <UserBar />

      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span className="text-muted-light">/</span>
              <Link href={`/orgs/${orgId}`} className="text-body-sm text-muted hover:text-foreground transition-colors">
                Organization
              </Link>
              <span className="text-muted-light">/</span>
              <Link href={`/orgs/${orgId}/venues/${venueId}`} className="text-body-sm text-muted hover:text-foreground transition-colors">
                {displayName}
              </Link>
              <span className="text-muted-light">/</span>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">Subscription</h1>
            <p className="text-body-sm text-muted mt-1">
              Choose a plan for {displayName}. Changes take effect immediately via Stripe.
            </p>
          </div>
          <Link href={`/orgs/${orgId}/venues/${venueId}`}>
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              &larr; Back to venue
            </span>
          </Link>
        </div>

        {subscriptionResult === 'success' && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 mb-6">
            <p className="text-body-sm font-medium text-green-700">Subscription activated — your plan is now live.</p>
          </div>
        )}
        {subscriptionResult === 'cancelled' && (
          <div className="rounded-md border border-border bg-surface px-4 py-3 mb-6">
            <p className="text-body-sm text-muted">Checkout was cancelled — no changes were made.</p>
          </div>
        )}

        <SubscriptionPanel venueId={venueId} orgId={orgId} currentPlan={currentPlan} />
      </main>
    </div>
  );
}
