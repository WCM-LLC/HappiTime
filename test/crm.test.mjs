import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// ─── Migration: schema, RLS, triggers ───────────────────────────────

const mig = readFileSync(
  new URL('../supabase/migrations/20260710160000_crm_core.sql', import.meta.url),
  'utf8'
);

test('migration creates the four CRM tables', () => {
  for (const t of ['crm_leads', 'crm_contacts', 'crm_activities', 'crm_tasks']) {
    assert.match(mig, new RegExp(`create table if not exists public\\.${t}`, 'i'));
  }
});

test('migration enables RLS on every CRM table', () => {
  for (const t of ['crm_leads', 'crm_contacts', 'crm_activities', 'crm_tasks']) {
    assert.match(mig, new RegExp(`alter table public\\.${t} enable row level security`, 'i'));
    assert.match(mig, new RegExp(`create policy ${t}_admin_all on public\\.${t}`, 'i'));
  }
});

test('CRM policies are admin-only, scoped to authenticated, and anon is revoked', () => {
  const policyCount = (mig.match(/for all to authenticated/gi) ?? []).length;
  assert.equal(policyCount, 4, 'each CRM table policy targets authenticated role only');
  const adminChecks = (mig.match(/public\.is_platform_admin\(\)/g) ?? []).length;
  assert.ok(adminChecks >= 8, 'using + with check on all 4 tables reference is_platform_admin()');
  assert.match(mig, /revoke all on public\.crm_leads, public\.crm_contacts, public\.crm_activities, public\.crm_tasks from anon/i);
  assert.doesNotMatch(mig, /to anon/i, 'no policy grants anon access');
});

test('migration constrains stage, lost_reason, and pipeline values', () => {
  assert.match(mig, /stage in \('new_lead','researched','contacted','responded','demo_scheduled','demo_completed','proposal_sent','pilot_active','won','lost','nurture'\)/);
  assert.match(mig, /lost_reason in \('no_response','not_interested','too_expensive','bad_fit','timing','competitor','owner_declined','duplicate','other'\)/);
  assert.match(mig, /crm_leads_lost_reason_requires_lost/);
  assert.match(mig, /interested_tier in \('listed','verified','featured','bundle','founding_pilot'\)/);
});

test('migration adds updated_at triggers and follow-up/stage indexes', () => {
  for (const t of ['crm_leads', 'crm_contacts', 'crm_tasks']) {
    assert.match(mig, new RegExp(`${t}_set_updated_at`, 'i'));
  }
  assert.match(mig, /crm_leads_stage_idx/);
  assert.match(mig, /crm_leads_next_follow_up_idx/);
  assert.match(mig, /crm_tasks_due_open_idx/);
});

test('CRM leads reference existing venues and organizations (no duplication)', () => {
  assert.match(mig, /venue_id uuid references public\.venues\(id\) on delete set null/);
  assert.match(mig, /organization_id uuid references public\.organizations\(id\) on delete set null/);
});

// ─── Server actions: admin guards ───────────────────────────────────

const actions = readFileSync(
  new URL('../apps/web/src/actions/admin-crm-actions.ts', import.meta.url),
  'utf8'
);

test('CRM actions are server actions', () => {
  assert.match(actions, /^'use server'/m);
});

test('every exported CRM action awaits assertAdmin before touching data', () => {
  const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.ok(exported.length >= 12, `expected 12+ actions, found ${exported.length}`);
  for (const name of exported) {
    const body = actions.split(`export async function ${name}`)[1].split('export async function')[0];
    assert.match(body, /await assertAdmin\(\)/, `${name} must call assertAdmin()`);
  }
});

test('stage changes validate against the allowed pipeline and log an activity', () => {
  assert.match(actions, /oneOf\(requireStr\(formData, 'stage'\), CRM_STAGES/);
  assert.match(actions, /activity_type: 'stage_change'/);
});

test('marking lost requires/normalizes a lost reason; other stages clear it', () => {
  assert.match(actions, /stage === 'lost'/);
  assert.match(actions, /CRM_LOST_REASONS/);
});

// ─── Pages: exist, guarded by admin layout, handle empty states ─────

const pages = {
  dashboard: '../apps/web/src/app/admin/crm/page.tsx',
  leads: '../apps/web/src/app/admin/crm/leads/page.tsx',
  leadNew: '../apps/web/src/app/admin/crm/leads/new/page.tsx',
  leadDetail: '../apps/web/src/app/admin/crm/leads/[id]/page.tsx',
  pipeline: '../apps/web/src/app/admin/crm/pipeline/page.tsx',
  tasks: '../apps/web/src/app/admin/crm/tasks/page.tsx',
  accounts: '../apps/web/src/app/admin/crm/accounts/page.tsx',
};

test('all CRM routes exist under the admin-guarded /admin segment', () => {
  for (const [name, path] of Object.entries(pages)) {
    assert.ok(existsSync(new URL(path, import.meta.url)), `${name} page missing at ${path}`);
  }
  // The admin layout redirects non-admins for every /admin/* route, CRM included.
  const layout = readFileSync(new URL('../apps/web/src/app/admin/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /isAdmin\(\)/);
  assert.match(layout, /redirect\('\/login\?next=\/admin&error=not_admin'\)/);
});

test('CRM pages render empty states', () => {
  const dashboard = readFileSync(new URL(pages.dashboard, import.meta.url), 'utf8');
  assert.match(dashboard, /No leads yet/);
  const leads = readFileSync(new URL(pages.leads, import.meta.url), 'utf8');
  assert.match(leads, /No leads match/);
  const tasks = readFileSync(new URL(pages.tasks, import.meta.url), 'utf8');
  assert.match(tasks, /Nothing overdue\./);
});

test('lead detail supports contacts, timeline, tasks, linking, and won/lost', () => {
  const detail = readFileSync(new URL(pages.leadDetail, import.meta.url), 'utf8');
  for (const needle of [
    'addCrmContact', 'logCrmActivity', 'addCrmTask', 'setCrmTaskStatus',
    'linkCrmLeadVenue', 'linkCrmLeadOrganization', 'changeCrmLeadStage',
    'setCrmLeadFollowUp', 'nextBestAction', 'lost_reason',
  ]) {
    assert.ok(detail.includes(needle), `lead detail missing ${needle}`);
  }
});

test('new lead form validates required name and supports convert-from-venue', () => {
  const form = readFileSync(new URL(pages.leadNew, import.meta.url), 'utf8');
  assert.match(form, /name="name" required/);
  assert.match(form, /venue_id/);
  const actionsSrc = actions;
  assert.match(actionsSrc, /requireStr\(formData, 'name'\)/);
});

// ─── CSV export: admin-guarded, formula-injection safe ──────────────

test('CSV export route is admin-guarded and escapes formula injection', () => {
  const route = readFileSync(new URL('../apps/web/src/app/admin/crm/leads/export/route.ts', import.meta.url), 'utf8');
  assert.match(route, /await isAdmin\(\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /\^\[=\+\\-@\]/);
});

// ─── Types: crm tables present in generated Database type ───────────

test('generated Supabase types include CRM tables', () => {
  const types = readFileSync(new URL('../supabase/types/generated.ts', import.meta.url), 'utf8');
  for (const t of ['crm_leads', 'crm_contacts', 'crm_activities', 'crm_tasks']) {
    assert.match(types, new RegExp(`${t}: \\{`), `${t} missing from generated types`);
  }
});
