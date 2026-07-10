import Link from 'next/link';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { Badge, Button, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import CrmShell from '../CrmShell';
import { changeCrmLeadStage } from '@/actions/admin-crm-actions';
import {
  CRM_STAGES, CRM_STAGE_LABELS, CRM_PRIORITIES, CRM_TIERS, CRM_TIER_LABELS,
  CRM_LEAD_SOURCES, formatCents, labelize, stageBadgeVariant,
} from '@/utils/crm';

export const dynamic = 'force-dynamic';

const SORTS: Record<string, { column: string; ascending: boolean }> = {
  follow_up: { column: 'next_follow_up_at', ascending: true },
  priority: { column: 'priority', ascending: false },
  stage: { column: 'stage', ascending: true },
  created: { column: 'created_at', ascending: false },
};

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; priority?: string; tier?: string; source?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const keyError = getServiceRoleKeyError();

  const shellProps = {
    title: 'Leads',
    description: 'Prospect venues and businesses',
    active: '/admin/crm/leads' as const,
    actions: (
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler returning a CSV download, not a page */}
        <a href="/admin/crm/leads/export" className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors">
          Export CSV
        </a>
        <Link href="/admin/crm/leads/new">
          <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer">
            + New Lead
          </span>
        </Link>
      </div>
    ),
  };

  if (keyError) {
    return <CrmShell {...shellProps}><p className="text-body-sm text-warning">Service role key required — see /admin.</p></CrmShell>;
  }

  const supabase = createServiceClient();
  const sort = SORTS[sp.sort ?? ''] ?? SORTS.created;

  let query = supabase
    .from('crm_leads')
    .select('id, name, city, neighborhood, stage, priority, interested_tier, lead_source, estimated_monthly_value_cents, next_follow_up_at, venue_id, created_at')
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .limit(200);

  if (sp.q) query = query.or(`name.ilike.%${sp.q}%,city.ilike.%${sp.q}%,neighborhood.ilike.%${sp.q}%`);
  if (sp.stage) query = query.eq('stage', sp.stage);
  if (sp.priority) query = query.eq('priority', sp.priority);
  if (sp.tier) query = query.eq('interested_tier', sp.tier);
  if (sp.source) query = query.eq('lead_source', sp.source);

  const { data: leads, error } = await query;

  return (
    <CrmShell {...shellProps}>
      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-2 mb-6">
        <div className="w-56">
          <Input name="q" placeholder="Search name, city, hood…" defaultValue={sp.q ?? ''} />
        </div>
        <div className="w-44">
          <Select name="stage" defaultValue={sp.stage ?? ''}>
            <option value="">All stages</option>
            {CRM_STAGES.map((s) => <option key={s} value={s}>{CRM_STAGE_LABELS[s]}</option>)}
          </Select>
        </div>
        <div className="w-36">
          <Select name="priority" defaultValue={sp.priority ?? ''}>
            <option value="">All priorities</option>
            {CRM_PRIORITIES.map((p) => <option key={p} value={p}>{labelize(p)}</option>)}
          </Select>
        </div>
        <div className="w-44">
          <Select name="tier" defaultValue={sp.tier ?? ''}>
            <option value="">All tiers</option>
            {CRM_TIERS.map((t) => <option key={t} value={t}>{CRM_TIER_LABELS[t]}</option>)}
          </Select>
        </div>
        <div className="w-44">
          <Select name="source" defaultValue={sp.source ?? ''}>
            <option value="">All sources</option>
            {CRM_LEAD_SOURCES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </Select>
        </div>
        <div className="w-40">
          <Select name="sort" defaultValue={sp.sort ?? 'created'}>
            <option value="created">Newest</option>
            <option value="follow_up">Follow-up date</option>
            <option value="priority">Priority</option>
            <option value="stage">Stage</option>
          </Select>
        </div>
        <Button type="submit" variant="secondary" size="sm" className="h-10">Filter</Button>
      </form>

      {error ? (
        <p className="text-body-sm text-error">Failed to load leads: {error.message}</p>
      ) : !leads || leads.length === 0 ? (
        <div className="rounded-md border border-border bg-surface p-10 text-center">
          <p className="text-body-md text-muted">No leads match.</p>
          <p className="text-body-sm text-muted mt-1">
            <Link href="/admin/crm/leads/new" className="text-brand hover:underline">Add a lead</Link> or clear filters.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Tier interest</TableHead>
                <TableHead>Est. value</TableHead>
                <TableHead>Next follow-up</TableHead>
                <TableHead>Quick stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const overdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date();
                return (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link href={`/admin/crm/leads/${lead.id}`} className="font-medium text-foreground hover:text-brand">
                        {lead.name}
                      </Link>
                      {lead.venue_id ? <span className="ml-1.5 text-caption text-muted" title="Linked to venue">🔗</span> : null}
                    </TableCell>
                    <TableCell className="text-muted">{[lead.city, lead.neighborhood].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell><Badge variant={stageBadgeVariant(lead.stage)}>{labelize(lead.stage)}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={lead.priority === 'high' ? 'error' : lead.priority === 'medium' ? 'warning' : 'secondary'}>
                        {labelize(lead.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted">{lead.interested_tier ? labelize(lead.interested_tier) : '—'}</TableCell>
                    <TableCell className="text-muted">{formatCents(lead.estimated_monthly_value_cents)}</TableCell>
                    <TableCell className={overdue ? 'text-error font-medium' : 'text-muted'}>
                      {lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <form action={changeCrmLeadStage} className="flex items-center gap-1.5">
                        <input type="hidden" name="lead_id" value={lead.id} />
                        <Select name="stage" defaultValue={lead.stage} className="h-8 w-40 text-caption">
                          {CRM_STAGES.map((s) => <option key={s} value={s}>{CRM_STAGE_LABELS[s]}</option>)}
                        </Select>
                        <Button type="submit" variant="ghost" size="sm">Set</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </CrmShell>
  );
}
