import Link from 'next/link';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import CrmShell from './CrmShell';
import {
  CRM_STAGES, CRM_STAGE_LABELS, CRM_OPEN_STAGES,
  formatCents, labelize, stageBadgeVariant,
} from '@/utils/crm';

export const dynamic = 'force-dynamic';

export default async function CrmDashboardPage() {
  const keyError = getServiceRoleKeyError();
  if (keyError) {
    return (
      <CrmShell title="CRM" description="Venue sales and relationships" active="/admin/crm">
        <div className="rounded-md border border-warning bg-warning-light px-4 py-3">
          <p className="text-body-sm font-medium text-warning">Service role key required</p>
          <p className="text-body-sm text-warning/80 mt-0.5">
            Add <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">SUPABASE_SERVICE_ROLE_KEY</code> to{' '}
            <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">apps/web/.env.local</code> to use the CRM.
          </p>
        </div>
      </CrmShell>
    );
  }

  const supabase = createServiceClient();
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [leadsRes, dueTasksRes, recentActivityRes] = await Promise.all([
    supabase.from('crm_leads').select('id, name, stage, priority, estimated_monthly_value_cents, next_follow_up_at, city, interested_tier'),
    supabase.from('crm_tasks').select('id, lead_id, title, due_at').eq('status', 'open').lte('due_at', todayEnd.toISOString()).order('due_at'),
    supabase.from('crm_activities').select('id, lead_id, activity_type, subject, occurred_at').order('occurred_at', { ascending: false }).limit(8),
  ]);

  const leads = leadsRes.data ?? [];
  const dueTasks = dueTasksRes.data ?? [];
  const recentActivity = recentActivityRes.data ?? [];
  const leadName = new Map(leads.map((l) => [l.id, l.name]));

  const byStage = new Map<string, number>();
  for (const l of leads) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);

  const openLeads = leads.filter((l) => (CRM_OPEN_STAGES as string[]).includes(l.stage));
  const pipelineValue = openLeads.reduce((sum, l) => sum + (l.estimated_monthly_value_cents ?? 0), 0);
  const followUpsDue = leads.filter((l) => l.next_follow_up_at && new Date(l.next_follow_up_at) <= todayEnd && (CRM_OPEN_STAGES as string[]).includes(l.stage));
  const highPriority = openLeads.filter((l) => l.priority === 'high').slice(0, 6);

  const stats = [
    { label: 'New leads', value: byStage.get('new_lead') ?? 0, href: '/admin/crm/leads?stage=new_lead' },
    { label: 'Open pipeline', value: openLeads.length, href: '/admin/crm/pipeline' },
    { label: 'Follow-ups due', value: followUpsDue.length + dueTasks.length, href: '/admin/crm/tasks' },
    { label: 'Pipeline value', value: pipelineValue > 0 ? formatCents(pipelineValue) : '$0/mo', href: '/admin/crm/pipeline' },
    { label: 'Won', value: byStage.get('won') ?? 0, href: '/admin/crm/leads?stage=won' },
    { label: 'Lost', value: byStage.get('lost') ?? 0, href: '/admin/crm/leads?stage=lost' },
  ];

  return (
    <CrmShell
      title="CRM"
      description="Venue sales, follow-ups, and relationships"
      active="/admin/crm"
      actions={
        <Link href="/admin/crm/leads/new">
          <span className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer">
            + New Lead
          </span>
        </Link>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <div className="rounded-md border border-border bg-surface p-4 hover:bg-background transition-colors">
              <p className="text-caption text-muted">{s.label}</p>
              <p className="text-heading-lg font-bold text-foreground mt-1">{s.value}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Deals by stage */}
        <Card>
          <CardHeader><CardTitle className="text-heading-sm">Leads by stage</CardTitle></CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <p className="text-body-sm text-muted">No leads yet. <Link href="/admin/crm/leads/new" className="text-brand hover:underline">Create the first one</Link>.</p>
            ) : (
              <div className="space-y-2">
                {CRM_STAGES.map((stage) => {
                  const count = byStage.get(stage) ?? 0;
                  if (count === 0) return null;
                  return (
                    <Link key={stage} href={`/admin/crm/leads?stage=${stage}`} className="flex items-center justify-between py-1 group">
                      <Badge variant={stageBadgeVariant(stage)}>{CRM_STAGE_LABELS[stage]}</Badge>
                      <span className="text-body-sm text-muted group-hover:text-foreground">{count}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-ups due */}
        <Card>
          <CardHeader><CardTitle className="text-heading-sm">Follow-ups due</CardTitle></CardHeader>
          <CardContent>
            {followUpsDue.length === 0 && dueTasks.length === 0 ? (
              <p className="text-body-sm text-muted">Nothing due today. Nice.</p>
            ) : (
              <div className="space-y-2">
                {followUpsDue.slice(0, 5).map((l) => (
                  <Link key={l.id} href={`/admin/crm/leads/${l.id}`} className="flex items-center justify-between py-1 group">
                    <span className="text-body-sm text-foreground group-hover:text-brand">{l.name}</span>
                    <span className="text-caption text-muted">{new Date(l.next_follow_up_at as string).toLocaleDateString()}</span>
                  </Link>
                ))}
                {dueTasks.slice(0, 5).map((t) => (
                  <Link key={t.id} href={`/admin/crm/leads/${t.lead_id}`} className="flex items-center justify-between py-1 group">
                    <span className="text-body-sm text-foreground group-hover:text-brand">{t.title} — {leadName.get(t.lead_id) ?? 'Lead'}</span>
                    <span className="text-caption text-muted">{t.due_at ? new Date(t.due_at).toLocaleDateString() : ''}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* High priority */}
        <Card>
          <CardHeader><CardTitle className="text-heading-sm">High-priority leads</CardTitle></CardHeader>
          <CardContent>
            {highPriority.length === 0 ? (
              <p className="text-body-sm text-muted">No high-priority open leads.</p>
            ) : (
              <div className="space-y-2">
                {highPriority.map((l) => (
                  <Link key={l.id} href={`/admin/crm/leads/${l.id}`} className="flex items-center justify-between py-1 group">
                    <span className="text-body-sm text-foreground group-hover:text-brand">{l.name}{l.city ? ` · ${l.city}` : ''}</span>
                    <Badge variant={stageBadgeVariant(l.stage)}>{labelize(l.stage)}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader><CardTitle className="text-heading-sm">Recent activity</CardTitle></CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-body-sm text-muted">No activity logged yet.</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((a) => (
                  <Link key={a.id} href={`/admin/crm/leads/${a.lead_id}`} className="flex items-center justify-between py-1 group">
                    <span className="text-body-sm text-foreground group-hover:text-brand truncate">
                      <span className="text-muted">{labelize(a.activity_type)}:</span> {a.subject ?? leadName.get(a.lead_id) ?? '—'}
                    </span>
                    <span className="text-caption text-muted shrink-0 ml-2">{new Date(a.occurred_at).toLocaleDateString()}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CrmShell>
  );
}
