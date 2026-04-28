alter table public.org_members
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.org_invites
  add column if not exists first_name text,
  add column if not exists last_name text;
