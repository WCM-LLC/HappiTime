import Link from 'next/link';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { Badge, Button, Select } from '@/components/ui';
import CrmShell from '../CrmShell';
import { changeCrmLeadStage } from '@/actions/admin-crm-actions';
import { CRM_STAGES, CRM_STAGE_LABELS, formatCents, labelize } from '@/utils/crm';

export const dynamic = 'force-dynamic';

/** Stages shown as pipeline columns (won/lost/nurture summarized below). */
const PIPELINE_STAGES = CRM_STAGES.filter((s) => !['won', 'lost', 'nurture'].includes(s));

export default async function CrmPipelinePage() {
  const keyError = getServiceRoleKeyError();
  if (keyError) {
    return <CrmShell title="Pipeline" active="/admin/crm/pipeline"><p className="text-body-sm text-warning">Service role key required — see /admin.</p></CrmShell>;
  }

  const supabase = createServiceClient();
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, name, city, priority, stage, interested_tier, estimated_monthly_value_cents, next_follow_up_at')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  const all = leads ?? [];
  const byStage = (stage: string) => all.filter((l) => l.stage === stage);
  const wonCount = byStage('won').length;
  const lostCount = byStage('lost').length;
  const nurtureCount = byStage('nurture').length;

  return (
    <CrmShell
      title="Pipeline"
      description="Leads grouped by stage — change stage inline"
      active="/admin/crm/pipeline"
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = byStage(stage);
          const value = stageLeads.reduce((s, l) => s + (l.estimated_monthly_value_cents ?? 0), 0);
          return (
            <div key={stage} className="w-64 shrink-0 rounded-md border border-border bg-surface">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-body-sm font-semibold text-foreground">{CRM_STAGE_LABELS[stage]}</p>
                <p className="text-caption text-muted">{stageLeads.length} lead{stageLeads.length === 1 ? '' : 's'}{value > 0 ? ` · ${formatCents(value)}` : ''}</p>
              </div>
              <div className="p-2 space-y-2 min-h-16">
                {stageLeads.length === 0 ? (
                  <p className="text-caption text-muted-light px-1 py-2">Empty</p>
                ) : stageLeads.map((l) => (
                  <div key={l.id} className="rounded-sm border border-border bg-background p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/admin/crm/leads/${l.id}`} className="text-body-sm font-medium text-foreground hover:text-brand truncate">
                        {l.name}
                      </Link>
                      {l.priority === 'high' ? <Badge variant="error">High</Badge> : null}
                    </div>
                    <p className="text-caption text-muted mt-0.5">
                      {[l.city, l.interested_tier ? labelize(l.interested_tier) : null, l.estimated_monthly_value_cents != null ? formatCents(l.estimated_monthly_value_cents) : null].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <form action={changeCrmLeadStage} className="flex items-center gap-1 mt-2">
                      <input type="hidden" name="lead_id" value={l.id} />
                      <Select name="stage" defaultValue={l.stage} className="h-7 text-caption px-2 pr-8">
                        {CRM_STAGES.map((s) => <option key={s} value={s}>{CRM_STAGE_LABELS[s]}</option>)}
                      </Select>
                      <Button type="submit" variant="ghost" size="sm" className="h-7 px-2">→</Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-2 text-body-sm text-muted">
        <Link href="/admin/crm/leads?stage=won" className="hover:text-foreground">✅ Won: {wonCount}</Link>
        <Link href="/admin/crm/leads?stage=lost" className="hover:text-foreground">❌ Lost: {lostCount}</Link>
        <Link href="/admin/crm/leads?stage=nurture" className="hover:text-foreground">🌱 Nurture: {nurtureCount}</Link>
      </div>
    </CrmShell>
  );
}
