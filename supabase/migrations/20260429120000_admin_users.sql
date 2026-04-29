-- Admin users table — managed via admin console, service-role only.

create table if not exists public.admin_users (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  created_at timestamptz default now(),
  created_by text
);

-- No authenticated/anon policies — all access goes through service role client.
alter table public.admin_users enable row level security;

-- Seed super admin; idempotent on re-run.
insert into public.admin_users (email, created_by)
values ('admin@happitime.biz', 'system')
on conflict (email) do nothing;

grant all on public.admin_users to service_role;
