import Link from 'next/link';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import CrmShell from '../CrmShell';
import { setCrmTaskStatus } from '@/actions/admin-crm-actions';
import { labelize } from '@/utils/crm';

export const dynamic = 'force-dynamic';

type TaskRow = {
  id: string;
  lead_id: string;
  title: string;
  due_at: string | null;
  status: string;
  priority: string;
  completed_at: string | null;
};

function TaskList({ tasks, leadNames, emptyText }: { tasks: TaskRow[]; leadNames: Map<string, string>; emptyText: string }) {
  if (tasks.length === 0) return <p className="text-body-sm text-muted">{emptyText}</p>;
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2">
          <div className="min-w-0">
            <p className={`text-body-sm ${t.status === 'completed' ? 'line-through text-muted' : 'text-foreground'}`}>
              {t.title}
              {t.priority === 'high' ? <Badge variant="error" className="ml-2">High</Badge> : null}
            </p>
            <p className="text-caption text-muted">
              <Link href={`/admin/crm/leads/${t.lead_id}`} className="text-brand hover:underline">
                {leadNames.get(t.lead_id) ?? 'Lead'}
              </Link>
              {t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString()}` : ' · no due date'}
            </p>
          </div>
          {t.status === 'open' ? (
            <form action={setCrmTaskStatus} className="shrink-0">
              <input type="hidden" name="task_id" value={t.id} />
              <input type="hidden" name="status" value="completed" />
              <Button type="submit" variant="secondary" size="sm">Done</Button>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default async function CrmTasksPage() {
  const keyError = getServiceRoleKeyError();
  if (keyError) {
    return <CrmShell title="Tasks" active="/admin/crm/tasks"><p className="text-body-sm text-warning">Service role key required — see /admin.</p></CrmShell>;
  }

  const supabase = createServiceClient();
  const [tasksRes, leadsRes] = await Promise.all([
    supabase.from('crm_tasks').select('id, lead_id, title, due_at, status, priority, completed_at').order('due_at', { ascending: true, nullsFirst: false }).limit(300),
    supabase.from('crm_leads').select('id, name'),
  ]);
  const tasks = (tasksRes.data ?? []) as TaskRow[];
  const leadNames = new Map((leadsRes.data ?? []).map((l) => [l.id, l.name]));

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const open = tasks.filter((t) => t.status === 'open');
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at) < todayStart);
  const today = open.filter((t) => t.due_at && new Date(t.due_at) >= todayStart && new Date(t.due_at) <= todayEnd);
  const upcoming = open.filter((t) => !t.due_at || new Date(t.due_at) > todayEnd);
  const completed = tasks.filter((t) => t.status === 'completed').slice(0, 20);

  return (
    <CrmShell title="Tasks & Follow-ups" description="Stay on top of every venue conversation" active="/admin/crm/tasks">
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-heading-sm text-error">Overdue ({overdue.length})</CardTitle></CardHeader>
          <CardContent><TaskList tasks={overdue} leadNames={leadNames} emptyText="Nothing overdue." /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-heading-sm">Today ({today.length})</CardTitle></CardHeader>
          <CardContent><TaskList tasks={today} leadNames={leadNames} emptyText="Nothing due today." /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-heading-sm">Upcoming ({upcoming.length})</CardTitle></CardHeader>
          <CardContent><TaskList tasks={upcoming} leadNames={leadNames} emptyText="No upcoming tasks. Schedule follow-ups from lead pages." /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-heading-sm text-muted">Recently completed ({completed.length})</CardTitle></CardHeader>
          <CardContent><TaskList tasks={completed} leadNames={leadNames} emptyText="No completed tasks yet." /></CardContent>
        </Card>
      </div>
      <p className="text-caption text-muted mt-4">Tasks are created from lead pages ({labelize('add_task')} or Schedule follow-up).</p>
    </CrmShell>
  );
}
