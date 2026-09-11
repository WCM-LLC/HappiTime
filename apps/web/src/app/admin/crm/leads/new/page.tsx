import Link from 'next/link';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Textarea } from '@/components/ui';
import CrmShell from '../../CrmShell';
import { createCrmLead } from '@/actions/admin-crm-actions';
import {
  CRM_STAGE_LABELS, CRM_LEAD_SOURCES, CRM_PRIORITIES, CRM_TIERS, CRM_TIER_LABELS, labelize,
} from '@/utils/crm';

export const dynamic = 'force-dynamic';

export default async function NewCrmLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ venue_id?: string; venue_q?: string }>;
}) {
  const sp = await searchParams;
  const keyError = getServiceRoleKeyError();

  if (keyError) {
    return (
      <CrmShell title="New Lead" active="/admin/crm/leads">
        <p className="text-body-sm text-warning">Service role key required — see /admin.</p>
      </CrmShell>
    );
  }

  const supabase = createServiceClient();

  // Convert-venue flow: prefill from an existing venue.
  let venue: { id: string; name: string; city: string; neighborhood: string | null; website: string | null; phone: string | null; org_id: string } | null = null;
  if (sp.venue_id) {
    const { data } = await supabase
      .from('venues')
      .select('id, name, city, neighborhood, website, phone, org_id')
      .eq('id', sp.venue_id)
      .single();
    venue = data;
  }

  // Venue search results for "convert venue into lead".
  let venueMatches: { id: string; name: string; city: string; is_verified: boolean }[] = [];
  if (sp.venue_q) {
    const { data } = await supabase
      .from('venues')
      .select('id, name, city, is_verified')
      .ilike('name', `%${sp.venue_q}%`)
      .order('name')
      .limit(10);
    venueMatches = data ?? [];
  }

  return (
    <CrmShell
      title="New Lead"
      description={venue ? `Converting venue: ${venue.name}` : 'Add a prospect manually or convert an existing venue'}
      active="/admin/crm/leads"
    >
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-heading-sm">Lead details</CardTitle></CardHeader>
          <CardContent>
            <form action={createCrmLead} className="space-y-4">
              {venue ? <input type="hidden" name="venue_id" value={venue.id} /> : null}
              {venue ? <input type="hidden" name="organization_id" value={venue.org_id} /> : null}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Business name *</Label>
                  <Input id="name" name="name" required defaultValue={venue?.name ?? ''} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" name="website" defaultValue={venue?.website ?? ''} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" defaultValue={venue?.phone ?? ''} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" defaultValue={venue?.city ?? ''} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="neighborhood">Neighborhood</Label>
                  <Input id="neighborhood" name="neighborhood" defaultValue={venue?.neighborhood ?? ''} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="lead_source">Source</Label>
                  <Select id="lead_source" name="lead_source" defaultValue={venue ? 'directory_import' : 'cold_outreach'} className="mt-1.5">
                    {CRM_LEAD_SOURCES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select id="priority" name="priority" defaultValue="medium" className="mt-1.5">
                    {CRM_PRIORITIES.map((p) => <option key={p} value={p}>{labelize(p)}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="interested_tier">Interested tier</Label>
                  <Select id="interested_tier" name="interested_tier" defaultValue="" className="mt-1.5">
                    <option value="">Unknown</option>
                    {CRM_TIERS.map((t) => <option key={t} value={t}>{CRM_TIER_LABELS[t]}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="estimated_monthly_value">Est. monthly value ($)</Label>
                  <Input id="estimated_monthly_value" name="estimated_monthly_value" placeholder="e.g. 99" inputMode="decimal" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="next_follow_up_at">Next follow-up</Label>
                  <Input id="next_follow_up_at" name="next_follow_up_at" type="date" className="mt-1.5" />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={3} className="mt-1.5" placeholder="Context, happy hour details, who to talk to…" />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" variant="brand">Create lead</Button>
                <Link href="/admin/crm/leads" className="text-body-sm text-muted hover:text-foreground">Cancel</Link>
                <span className="text-caption text-muted ml-auto">Starts in stage: {CRM_STAGE_LABELS.new_lead}</span>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader><CardTitle className="text-heading-sm">Convert an existing venue</CardTitle></CardHeader>
          <CardContent>
            <form method="get" className="flex gap-2 mb-3">
              <Input name="venue_q" placeholder="Search venues…" defaultValue={sp.venue_q ?? ''} />
              <Button type="submit" variant="secondary" size="sm" className="h-10">Search</Button>
            </form>
            {sp.venue_q && venueMatches.length === 0 ? (
              <p className="text-body-sm text-muted">No venues match “{sp.venue_q}”.</p>
            ) : null}
            <div className="space-y-1.5">
              {venueMatches.map((v) => (
                <Link
                  key={v.id}
                  href={`/admin/crm/leads/new?venue_id=${v.id}`}
                  className="flex items-center justify-between rounded-sm border border-border px-3 py-2 hover:bg-background transition-colors"
                >
                  <span className="text-body-sm text-foreground">{v.name}</span>
                  <span className="text-caption text-muted">{v.city}{v.is_verified ? ' · ✓ Verified' : ''}</span>
                </Link>
              ))}
            </div>
            <p className="text-caption text-muted mt-3">
              Converting prefills the form and links the lead to the venue + its organization.
            </p>
          </CardContent>
        </Card>
      </div>
    </CrmShell>
  );
}
