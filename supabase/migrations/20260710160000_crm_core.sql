-- CRM core schema — lean internal CRM for venue sales.
-- Tables: crm_leads, crm_contacts, crm_activities, crm_tasks.
-- Accounts intentionally NOT duplicated: the CRM links to existing
-- public.organizations / public.venues. Deals live on the lead itself
-- (stage + interested_tier + estimated_monthly_value_cents).
-- All tables are admin-only via RLS (public.is_platform_admin()).

-- ─────────────────────────────────────────────
-- crm_leads
-- ─────────────────────────────────────────────
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue_id uuid references public.venues(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  website text,
  phone text,
  email text,
  city text,
  neighborhood text,
  lead_source text not null default 'other'
    check (lead_source in ('cold_outreach','inbound','referral','event','walk_in','directory_import','partner','other')),
  stage text not null default 'new_lead'
    check (stage in ('new_lead','researched','contacted','responded','demo_scheduled','demo_completed','proposal_sent','pilot_active','won','lost','nurture')),
  lost_reason text
    check (lost_reason in ('no_response','not_interested','too_expensive','bad_fit','timing','competitor','owner_declined','duplicate','other')),
  priority text not null default 'medium'
    check (priority in ('low','medium','high')),
  interested_tier text
    check (interested_tier in ('listed','verified','featured','bundle','founding_pilot')),
  estimated_monthly_value_cents integer check (estimated_monthly_value_cents >= 0),
  next_follow_up_at timestamptz,
  owner_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_leads_lost_reason_requires_lost
    check (lost_reason is null or stage = 'lost')
);

comment on table public.crm_leads is 'Internal CRM: prospect venues/businesses. Admin-only.';

create index if not exists crm_leads_stage_idx on public.crm_leads (stage);
create index if not exists crm_leads_next_follow_up_idx on public.crm_leads (next_follow_up_at) where next_follow_up_at is not null;
create index if not exists crm_leads_owner_idx on public.crm_leads (owner_user_id);
create index if not exists crm_leads_venue_idx on public.crm_leads (venue_id);
create index if not exists crm_leads_org_idx on public.crm_leads (organization_id);
create index if not exists crm_leads_priority_idx on public.crm_leads (priority);
create index if not exists crm_leads_city_idx on public.crm_leads (city);

-- ─────────────────────────────────────────────
-- crm_contacts
-- ─────────────────────────────────────────────
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  title text,
  email text,
  phone text,
  preferred_contact_method text
    check (preferred_contact_method in ('email','phone','text','in_person')),
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_contacts is 'Internal CRM: people at prospect venues/orgs. Contains PII — admin-only.';

create index if not exists crm_contacts_lead_idx on public.crm_contacts (lead_id);

-- ─────────────────────────────────────────────
-- crm_activities (timeline; objections + stage changes are activity types)
-- ─────────────────────────────────────────────
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  activity_type text not null
    check (activity_type in ('call','email','meeting','demo','note','text','visit','proposal_sent','stage_change','objection')),
  direction text check (direction in ('outbound','inbound')),
  subject text,
  body text,
  outcome text,
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.crm_activities is 'Internal CRM: outreach/relationship timeline. Admin-only.';

create index if not exists crm_activities_lead_occurred_idx on public.crm_activities (lead_id, occurred_at desc);

-- ─────────────────────────────────────────────
-- crm_tasks (follow-ups)
-- ─────────────────────────────────────────────
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open','completed','canceled')),
  priority text not null default 'medium'
    check (priority in ('low','medium','high')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_tasks is 'Internal CRM: follow-ups and sales tasks. Admin-only.';

create index if not exists crm_tasks_lead_idx on public.crm_tasks (lead_id);
create index if not exists crm_tasks_due_open_idx on public.crm_tasks (due_at) where status = 'open';
create index if not exists crm_tasks_assigned_idx on public.crm_tasks (assigned_to);

-- ─────────────────────────────────────────────
-- updated_at triggers (reuses public.set_updated_at())
-- ─────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'crm_leads_set_updated_at') then
    create trigger crm_leads_set_updated_at
    before update on public.crm_leads
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'crm_contacts_set_updated_at') then
    create trigger crm_contacts_set_updated_at
    before update on public.crm_contacts
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'crm_tasks_set_updated_at') then
    create trigger crm_tasks_set_updated_at
    before update on public.crm_tasks
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- ─────────────────────────────────────────────
-- RLS: admin-only. No anon access. Authenticated non-admins blocked.
-- Reuses public.is_platform_admin() (SECURITY DEFINER, checks admin_users).
-- ─────────────────────────────────────────────
alter table public.crm_leads enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_tasks enable row level security;

drop policy if exists crm_leads_admin_all on public.crm_leads;
create policy crm_leads_admin_all on public.crm_leads
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists crm_contacts_admin_all on public.crm_contacts;
create policy crm_contacts_admin_all on public.crm_contacts
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists crm_activities_admin_all on public.crm_activities;
create policy crm_activities_admin_all on public.crm_activities
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists crm_tasks_admin_all on public.crm_tasks;
create policy crm_tasks_admin_all on public.crm_tasks
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Belt-and-suspenders: no anon grants on CRM tables.
revoke all on public.crm_leads, public.crm_contacts, public.crm_activities, public.crm_tasks from anon;
