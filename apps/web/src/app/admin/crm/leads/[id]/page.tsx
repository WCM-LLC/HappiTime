import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Separator, Textarea } from '@/components/ui';
import CrmShell from '../../CrmShell';
import {
  addCrmContact, addCrmTask, changeCrmLeadStage, claimCrmLead, deleteCrmContact,
  linkCrmLeadOrganization, linkCrmLeadVenue, logCrmActivity, setCrmLeadFollowUp,
  setCrmTaskStatus, updateCrmLead,
} from '@/actions/admin-crm-actions';
import {
  CRM_STAGES, CRM_STAGE_LABELS, CRM_LOST_REASONS, CRM_LEAD_SOURCES, CRM_PRIORITIES,
  CRM_TIERS, CRM_TIER_LABELS, CRM_ACTIVITY_TYPES,
  formatCents, labelize, nextBestAction, stageBadgeVariant,
} from '@/utils/crm';

export const dynamic = 'force-dynamic';

const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', meeting: '🤝', demo: '🖥️', note: '📝', text: '💬',
  visit: '🚶', proposal_sent: '📄', stage_change: '🔀', objection: '⚠️',
};

export default async function CrmLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ venue_q?: string; org_q?: string; edit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const keyError = getServiceRoleKeyError();
  if (keyError) {
    return <CrmShell title="Lead" active="/admin/crm/leads"><p className="text-body-sm text-warning">Service role key required — see /admin.</p></CrmShell>;
  }

  const supabase = createServiceClient();

  const { data: lead } = await supabase.from('crm_leads').select('*').eq('id', id).single();
  if (!lead) notFound();

  const [contactsRes, activitiesRes, tasksRes] = await Promise.all([
    supabase.from('crm_contacts').select('*').eq('lead_id', id).order('is_primary', { ascending: false }).order('created_at'),
    supabase.from('crm_activities').select('*').eq('lead_id', id).order('occurred_at', { ascending: false }).limit(50),
    supabase.from('crm_tasks').select('*').eq('lead_id', id).order('status').order('due_at', { ascending: true, nullsFirst: false }),
  ]);
  const contacts = contactsRes.data ?? [];
  const activities = activitiesRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const openTasks = tasks.filter((t) => t.status === 'open');

  // Linked venue: subscription + attribution readiness.
  let venue: { id: string; name: string; slug: string; city: string; is_verified: boolean; promotion_tier: string | null } | null = null;
  let subscription: { plan: string; status: string; monthly_rate_cents: number | null; founding_pilot_until: string | null } | null = null;
  let attribution: { scans: number; checkins: number; visits: number } | null = null;
  if (lead.venue_id) {
    const [venueRes, subRes, scanRes, checkinRes, visitRes] = await Promise.all([
      supabase.from('venues').select('id, name, slug, city, is_verified, promotion_tier').eq('id', lead.venue_id).single(),
      supabase.from('venue_subscriptions').select('plan, status, monthly_rate_cents, founding_pilot_until').eq('venue_id', lead.venue_id).maybeSingle(),
      supabase.from('venue_attribution_events').select('id', { count: 'exact', head: true }).eq('venue_id', lead.venue_id),
      supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('venue_id', lead.venue_id),
      supabase.from('venue_visits').select('id', { count: 'exact', head: true }).eq('venue_id', lead.venue_id),
    ]);
    venue = venueRes.data;
    subscription = subRes.data;
    attribution = { scans: scanRes.count ?? 0, checkins: checkinRes.count ?? 0, visits: visitRes.count ?? 0 };
  }

  // Linked organization summary.
  let org: { id: string; name: string; venueCount: number } | null = null;
  if (lead.organization_id) {
    const [orgRes, venueCountRes] = await Promise.all([
      supabase.from('organizations').select('id, name').eq('id', lead.organization_id).single(),
      supabase.from('venues').select('id', { count: 'exact', head: true }).eq('org_id', lead.organization_id),
    ]);
    if (orgRes.data) org = { ...orgRes.data, venueCount: venueCountRes.count ?? 0 };
  }

  // Link-search results.
  let venueMatches: { id: string; name: string; city: string }[] = [];
  if (sp.venue_q) {
    const { data } = await supabase.from('venues').select('id, name, city').ilike('name', `%${sp.venue_q}%`).order('name').limit(8);
    venueMatches = data ?? [];
  }
  let orgMatches: { id: string; name: string }[] = [];
  if (sp.org_q) {
    const { data } = await supabase.from('organizations').select('id, name').ilike('name', `%${sp.org_q}%`).order('name').limit(8);
    orgMatches = data ?? [];
  }

  const suggested = nextBestAction({ stage: lead.stage, next_follow_up_at: lead.next_follow_up_at, openTaskCount: openTasks.length });
  const editing = sp.edit === '1';

  return (
    <CrmShell
      title={lead.name}
      description={[lead.city, lead.neighborhood].filter(Boolean).join(' · ') || undefined}
      active="/admin/crm/leads"
      actions={
        <div className="flex items-center gap-2">
          <Badge variant={stageBadgeVariant(lead.stage)} className="h-7 px-3">{labelize(lead.stage)}</Badge>
          <Link href={editing ? `/admin/crm/leads/${id}` : `/admin/crm/leads/${id}?edit=1`}>
            <span className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-surface text-body-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors cursor-pointer">
              {editing ? 'Done editing' : 'Edit lead'}
            </span>
          </Link>
        </div>
      }
    >
      {/* Next best action */}
      <div className="rounded-md border border-brand/30 bg-brand-subtle px-4 py-3 mb-6 flex items-center justify-between gap-4">
        <p className="text-body-sm text-brand-dark-alt"><span className="font-semibold">Next best action:</span> {suggested}</p>
        <Button variant="ghost" size="sm" disabled title="LLM-assisted drafting is planned — no AI provider wired to CRM yet.">
          ✨ Draft outreach (soon)
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left column: summary + workflow ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-heading-sm">Summary</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <form action={updateCrmLead} className="space-y-3">
                  <input type="hidden" name="lead_id" value={id} />
                  <div><Label>Name *</Label><Input name="name" required defaultValue={lead.name} className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Website</Label><Input name="website" defaultValue={lead.website ?? ''} className="mt-1" /></div>
                    <div><Label>Phone</Label><Input name="phone" defaultValue={lead.phone ?? ''} className="mt-1" /></div>
                    <div><Label>Email</Label><Input name="email" defaultValue={lead.email ?? ''} className="mt-1" /></div>
                    <div><Label>City</Label><Input name="city" defaultValue={lead.city ?? ''} className="mt-1" /></div>
                    <div><Label>Neighborhood</Label><Input name="neighborhood" defaultValue={lead.neighborhood ?? ''} className="mt-1" /></div>
                    <div>
                      <Label>Source</Label>
                      <Select name="lead_source" defaultValue={lead.lead_source} className="mt-1">
                        {CRM_LEAD_SOURCES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select name="priority" defaultValue={lead.priority} className="mt-1">
                        {CRM_PRIORITIES.map((p) => <option key={p} value={p}>{labelize(p)}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label>Interested tier</Label>
                      <Select name="interested_tier" defaultValue={lead.interested_tier ?? ''} className="mt-1">
                        <option value="">Unknown</option>
                        {CRM_TIERS.map((t) => <option key={t} value={t}>{CRM_TIER_LABELS[t]}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label>Est. value ($/mo)</Label>
                      <Input name="estimated_monthly_value" defaultValue={lead.estimated_monthly_value_cents != null ? String(lead.estimated_monthly_value_cents / 100) : ''} className="mt-1" />
                    </div>
                    <div>
                      <Label>Next follow-up</Label>
                      <Input name="next_follow_up_at" type="date" defaultValue={lead.next_follow_up_at ? lead.next_follow_up_at.slice(0, 10) : ''} className="mt-1" />
                    </div>
                  </div>
                  <div><Label>Notes</Label><Textarea name="notes" rows={3} defaultValue={lead.notes ?? ''} className="mt-1" /></div>
                  <Button type="submit" variant="brand" size="sm">Save changes</Button>
                </form>
              ) : (
                <dl className="space-y-2 text-body-sm">
                  {[
                    ['Website', lead.website ? <a key="w" href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">{lead.website}</a> : '—'],
                    ['Phone', lead.phone ?? '—'],
                    ['Email', lead.email ?? '—'],
                    ['Source', labelize(lead.lead_source)],
                    ['Priority', labelize(lead.priority)],
                    ['Interested tier', lead.interested_tier ? CRM_TIER_LABELS[lead.interested_tier as (typeof CRM_TIERS)[number]] : '—'],
                    ['Est. value', formatCents(lead.estimated_monthly_value_cents)],
                    ['Next follow-up', lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleDateString() : '—'],
                    ['Owner', lead.owner_user_id ? 'Assigned' : 'Unassigned'],
                    ['Created', new Date(lead.created_at).toLocaleDateString()],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between gap-3">
                      <dt className="text-muted shrink-0">{label}</dt>
                      <dd className="text-foreground text-right">{value}</dd>
                    </div>
                  ))}
                  {lead.notes ? (<><Separator className="my-2" /><p className="text-muted whitespace-pre-wrap">{lead.notes}</p></>) : null}
                </dl>
              )}
              {!lead.owner_user_id && !editing ? (
                <form action={claimCrmLead} className="mt-3">
                  <input type="hidden" name="lead_id" value={id} />
                  <Button type="submit" variant="secondary" size="sm">Claim ownership</Button>
                </form>
              ) : null}
            </CardContent>
          </Card>

          {/* Stage */}
          <Card>
            <CardHeader><CardTitle className="text-heading-sm">Stage</CardTitle></CardHeader>
            <CardContent>
              <form action={changeCrmLeadStage} className="space-y-3">
                <input type="hidden" name="lead_id" value={id} />
                <Select name="stage" defaultValue={lead.stage}>
                  {CRM_STAGES.map((s) => <option key={s} value={s}>{CRM_STAGE_LABELS[s]}</option>)}
                </Select>
                <div>
                  <Label className="text-caption text-muted">Lost reason (only if marking Lost)</Label>
                  <Select name="lost_reason" defaultValue={lead.lost_reason ?? ''} className="mt-1">
                    <option value="">—</option>
                    {CRM_LOST_REASONS.map((r) => <option key={r} value={r}>{labelize(r)}</option>)}
                  </Select>
                </div>
                <Button type="submit" variant="secondary" size="sm">Update stage</Button>
              </form>
            </CardContent>
          </Card>

          {/* Linked records */}
          <Card>
            <CardHeader><CardTitle className="text-heading-sm">Linked records</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {venue ? (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-body-sm font-medium text-foreground">{venue.name}</p>
                      <p className="text-caption text-muted">
                        {venue.city} · {venue.is_verified ? '✓ Verified' : 'Not verified'}
                        {venue.promotion_tier ? ` · ${labelize(venue.promotion_tier)}` : ''}
                      </p>
                    </div>
                    <form action={linkCrmLeadVenue}>
                      <input type="hidden" name="lead_id" value={id} />
                      <Button type="submit" variant="ghost" size="sm">Unlink</Button>
                    </form>
                  </div>
                  {subscription ? (
                    <p className="text-caption text-muted mt-1">
                      Subscription: {labelize(subscription.plan)} ({labelize(subscription.status)})
                      {subscription.monthly_rate_cents != null ? ` · ${formatCents(subscription.monthly_rate_cents)}` : ''}
                      {subscription.founding_pilot_until ? ` · Pilot until ${new Date(subscription.founding_pilot_until).toLocaleDateString()}` : ''}
                    </p>
                  ) : (
                    <p className="text-caption text-muted mt-1">No subscription — free Listed tier.</p>
                  )}
                  {attribution ? (
                    <p className="text-caption text-muted mt-1">
                      QR/attribution readiness: {attribution.scans} scans · {attribution.checkins} check-ins · {attribution.visits} visits
                    </p>
                  ) : null}
                </div>
              ) : (
                <div>
                  <p className="text-caption text-muted mb-2">No venue linked.</p>
                  <form method="get" className="flex gap-2">
                    <Input name="venue_q" placeholder="Search venues…" defaultValue={sp.venue_q ?? ''} className="h-9" />
                    <Button type="submit" variant="secondary" size="sm" className="h-9">Find</Button>
                  </form>
                  {venueMatches.map((v) => (
                    <form key={v.id} action={linkCrmLeadVenue} className="flex items-center justify-between mt-1.5">
                      <input type="hidden" name="lead_id" value={id} />
                      <input type="hidden" name="venue_id" value={v.id} />
                      <span className="text-body-sm text-foreground">{v.name} <span className="text-muted">· {v.city}</span></span>
                      <Button type="submit" variant="ghost" size="sm">Link</Button>
                    </form>
                  ))}
                </div>
              )}

              <Separator />

              {org ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-body-sm font-medium text-foreground">{org.name}</p>
                    <p className="text-caption text-muted">{org.venueCount} venue{org.venueCount === 1 ? '' : 's'} · <Link href={`/admin/crm/accounts?q=${encodeURIComponent(org.name)}`} className="text-brand hover:underline">view account</Link></p>
                  </div>
                  <form action={linkCrmLeadOrganization}>
                    <input type="hidden" name="lead_id" value={id} />
                    <Button type="submit" variant="ghost" size="sm">Unlink</Button>
                  </form>
                </div>
              ) : (
                <div>
                  <p className="text-caption text-muted mb-2">No organization linked.</p>
                  <form method="get" className="flex gap-2">
                    <Input name="org_q" placeholder="Search organizations…" defaultValue={sp.org_q ?? ''} className="h-9" />
                    <Button type="submit" variant="secondary" size="sm" className="h-9">Find</Button>
                  </form>
                  {orgMatches.map((o) => (
                    <form key={o.id} action={linkCrmLeadOrganization} className="flex items-center justify-between mt-1.5">
                      <input type="hidden" name="lead_id" value={id} />
                      <input type="hidden" name="organization_id" value={o.id} />
                      <span className="text-body-sm text-foreground">{o.name}</span>
                      <Button type="submit" variant="ghost" size="sm">Link</Button>
                    </form>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Middle column: timeline ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-heading-sm">Log activity</CardTitle></CardHeader>
            <CardContent>
              <form action={logCrmActivity} className="space-y-3">
                <input type="hidden" name="lead_id" value={id} />
                <div className="grid grid-cols-2 gap-3">
                  <Select name="activity_type" defaultValue="note">
                    {CRM_ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
                  </Select>
                  <Select name="direction" defaultValue="">
                    <option value="">No direction</option>
                    <option value="outbound">Outbound</option>
                    <option value="inbound">Inbound</option>
                  </Select>
                </div>
                {contacts.length > 0 ? (
                  <Select name="contact_id" defaultValue="">
                    <option value="">No contact</option>
                    {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                ) : null}
                <Input name="subject" placeholder="Subject (optional)" />
                <Textarea name="body" rows={2} placeholder="What happened?" />
                <Input name="outcome" placeholder="Outcome (optional, e.g. left voicemail, wants pricing)" />
                <Button type="submit" variant="brand" size="sm">Log activity</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-heading-sm">Timeline</CardTitle></CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-body-sm text-muted">No activity yet — log the first touch above.</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((a) => (
                    <div key={a.id} className="flex gap-3">
                      <span className="text-body-md shrink-0" aria-hidden>{ACTIVITY_ICONS[a.activity_type] ?? '•'}</span>
                      <div className="min-w-0">
                        <p className="text-body-sm text-foreground">
                          <span className="font-medium">{labelize(a.activity_type)}</span>
                          {a.direction ? <span className="text-muted"> · {a.direction}</span> : null}
                          {a.subject ? <span> — {a.subject}</span> : null}
                        </p>
                        {a.body ? <p className="text-body-sm text-muted whitespace-pre-wrap">{a.body}</p> : null}
                        {a.outcome ? <p className="text-caption text-muted">Outcome: {a.outcome}</p> : null}
                        <p className="text-caption text-muted-light">{new Date(a.occurred_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column: contacts + tasks ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-heading-sm">Contacts</CardTitle></CardHeader>
            <CardContent>
              {contacts.length === 0 ? <p className="text-body-sm text-muted mb-3">No contacts yet.</p> : (
                <div className="space-y-3 mb-4">
                  {contacts.map((c) => (
                    <div key={c.id} className="rounded-sm border border-border px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-body-sm font-medium text-foreground">
                          {c.name}{c.is_primary ? <Badge variant="brand" className="ml-2">Primary</Badge> : null}
                        </p>
                        <form action={deleteCrmContact}>
                          <input type="hidden" name="lead_id" value={id} />
                          <input type="hidden" name="contact_id" value={c.id} />
                          <button type="submit" className="text-caption text-muted hover:text-error cursor-pointer">Remove</button>
                        </form>
                      </div>
                      <p className="text-caption text-muted">
                        {[c.title, c.email, c.phone].filter(Boolean).join(' · ') || 'No details'}
                        {c.preferred_contact_method ? ` · prefers ${labelize(c.preferred_contact_method)}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <details>
                <summary className="text-body-sm text-brand cursor-pointer">+ Add contact</summary>
                <form action={addCrmContact} className="space-y-2 mt-3">
                  <input type="hidden" name="lead_id" value={id} />
                  <Input name="name" required placeholder="Name *" />
                  <Input name="title" placeholder="Title (e.g. Owner, GM)" />
                  <Input name="email" type="email" placeholder="Email" />
                  <Input name="phone" placeholder="Phone" />
                  <Select name="preferred_contact_method" defaultValue="">
                    <option value="">Preferred method…</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="text">Text</option>
                    <option value="in_person">In person</option>
                  </Select>
                  <label className="flex items-center gap-2 text-body-sm text-muted">
                    <input type="checkbox" name="is_primary" /> Primary contact
                  </label>
                  <Button type="submit" variant="secondary" size="sm">Add contact</Button>
                </form>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-heading-sm">Tasks & follow-ups</CardTitle></CardHeader>
            <CardContent>
              {tasks.length === 0 ? <p className="text-body-sm text-muted mb-3">No tasks yet.</p> : (
                <div className="space-y-2 mb-4">
                  {tasks.map((t) => {
                    const overdue = t.status === 'open' && t.due_at && new Date(t.due_at) < new Date();
                    return (
                      <div key={t.id} className="flex items-start justify-between gap-2 rounded-sm border border-border px-3 py-2">
                        <div>
                          <p className={`text-body-sm ${t.status === 'completed' ? 'line-through text-muted' : 'text-foreground'}`}>{t.title}</p>
                          <p className={`text-caption ${overdue ? 'text-error font-medium' : 'text-muted'}`}>
                            {t.due_at ? new Date(t.due_at).toLocaleDateString() : 'No due date'} · {labelize(t.status)}{overdue ? ' · OVERDUE' : ''}
                          </p>
                        </div>
                        {t.status === 'open' ? (
                          <form action={setCrmTaskStatus}>
                            <input type="hidden" name="task_id" value={t.id} />
                            <input type="hidden" name="lead_id" value={id} />
                            <input type="hidden" name="status" value="completed" />
                            <Button type="submit" variant="ghost" size="sm">Done</Button>
                          </form>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              <details open={tasks.length === 0}>
                <summary className="text-body-sm text-brand cursor-pointer">+ Add task</summary>
                <form action={addCrmTask} className="space-y-2 mt-3">
                  <input type="hidden" name="lead_id" value={id} />
                  <Input name="title" required placeholder="Task title *" />
                  <Input name="due_at" type="date" />
                  <Select name="priority" defaultValue="medium">
                    {CRM_PRIORITIES.map((p) => <option key={p} value={p}>{labelize(p)}</option>)}
                  </Select>
                  <Button type="submit" variant="secondary" size="sm">Add task</Button>
                </form>
              </details>

              <Separator className="my-4" />

              <form action={setCrmLeadFollowUp} className="space-y-2">
                <input type="hidden" name="lead_id" value={id} />
                <Label className="text-caption text-muted">Schedule follow-up (sets date + creates task)</Label>
                <div className="flex gap-2">
                  <Input name="next_follow_up_at" type="date" required className="h-9" />
                  <Button type="submit" variant="secondary" size="sm" className="h-9">Schedule</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </CrmShell>
  );
}
