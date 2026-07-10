import Link from 'next/link';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { Badge, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import CrmShell from '../CrmShell';
import { formatCents, labelize } from '@/utils/crm';

export const dynamic = 'force-dynamic';

// Accounts = existing organizations (no duplicate CRM table). This page rolls up
// venues, subscriptions, bundles, and open CRM leads per organization.
export default async function CrmAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const keyError = getServiceRoleKeyError();
  if (keyError) {
    return <CrmShell title="Accounts" active="/admin/crm/accounts"><p className="text-body-sm text-warning">Service role key required — see /admin.</p></CrmShell>;
  }

  const supabase = createServiceClient();

  let orgQuery = supabase.from('organizations').select('id, name, slug, created_at').order('name').limit(100);
  if (sp.q) orgQuery = orgQuery.ilike('name', `%${sp.q}%`);

  const [orgsRes, venuesRes, venueSubsRes, orgSubsRes, leadsRes] = await Promise.all([
    orgQuery,
    supabase.from('venues').select('id, org_id, is_verified'),
    supabase.from('venue_subscriptions').select('org_id, plan, status'),
    supabase.from('org_subscriptions').select('org_id, bundle_tier, status, venue_count, monthly_rate_per_venue_cents'),
    supabase.from('crm_leads').select('id, organization_id, stage'),
  ]);

  const orgs = orgsRes.data ?? [];
  const venues = venuesRes.data ?? [];
  const venueSubs = venueSubsRes.data ?? [];
  const orgSubs = orgSubsRes.data ?? [];
  const leads = leadsRes.data ?? [];

  const rows = orgs.map((org) => {
    const orgVenues = venues.filter((v) => v.org_id === org.id);
    const verified = orgVenues.filter((v) => v.is_verified).length;
    const paidSubs = venueSubs.filter((s) => s.org_id === org.id && (s.status === 'active' || s.status === 'trialing'));
    const bundle = orgSubs.find((s) => s.org_id === org.id);
    const orgLeads = leads.filter((l) => l.organization_id === org.id);
    const openLeads = orgLeads.filter((l) => !['won', 'lost'].includes(l.stage));
    return { org, venueCount: orgVenues.length, verified, paidSubs: paidSubs.length, bundle, openLeads: openLeads.length, totalLeads: orgLeads.length };
  })
  // Multi-venue groups and orgs with CRM activity first — that's where bundle revenue is.
  .sort((a, b) => (b.venueCount + b.totalLeads * 2) - (a.venueCount + a.totalLeads * 2));

  return (
    <CrmShell
      title="Accounts"
      description="Ownership groups and organizations — bundle and multi-venue potential"
      active="/admin/crm/accounts"
    >
      <form method="get" className="flex gap-2 mb-6 max-w-sm">
        <Input name="q" placeholder="Search organizations…" defaultValue={sp.q ?? ''} />
        <Button type="submit" variant="secondary" size="sm" className="h-10">Search</Button>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-md border border-border bg-surface p-10 text-center">
          <p className="text-body-md text-muted">No organizations match.</p>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Venues</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Paid subs</TableHead>
                <TableHead>Bundle</TableHead>
                <TableHead>Open leads</TableHead>
                <TableHead>Bundle potential</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ org, venueCount, verified, paidSubs, bundle, openLeads }) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <Link href={`/orgs/${org.id}`} className="font-medium text-foreground hover:text-brand">{org.name}</Link>
                    {openLeads > 0 ? (
                      <Link href={`/admin/crm/leads?q=${encodeURIComponent(org.name)}`} className="ml-2 text-caption text-brand hover:underline">view leads</Link>
                    ) : null}
                  </TableCell>
                  <TableCell>{venueCount}</TableCell>
                  <TableCell className="text-muted">{verified} / {venueCount}</TableCell>
                  <TableCell className="text-muted">{paidSubs}</TableCell>
                  <TableCell>
                    {bundle ? (
                      <Badge variant={bundle.status === 'active' ? 'success' : 'secondary'}>
                        {labelize(bundle.bundle_tier)} · {bundle.venue_count} venues · {formatCents(bundle.monthly_rate_per_venue_cents)}/venue
                      </Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell>{openLeads > 0 ? <Badge variant="brand">{openLeads}</Badge> : <span className="text-muted">0</span>}</TableCell>
                  <TableCell>
                    {venueCount >= 2 && !bundle ? (
                      <Badge variant="warning">Bundle candidate ({venueCount} venues)</Badge>
                    ) : venueCount >= 1 && paidSubs === 0 && !bundle ? (
                      <span className="text-caption text-muted">Upsell to Verified</span>
                    ) : (
                      <span className="text-caption text-muted">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-caption text-muted mt-3">
        Accounts are your existing organizations — no duplicate CRM records. Click an org to manage it, or create a lead and link it to the org.
      </p>
    </CrmShell>
  );
}
