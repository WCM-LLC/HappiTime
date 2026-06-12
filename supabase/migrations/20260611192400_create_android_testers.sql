-- Reconstructed from remote supabase_migrations.schema_migrations (Jun 11 2026).
-- This version was applied directly to the remote project without a local file,
-- which broke `supabase db push` (remote version missing locally). Content is
-- verbatim from the remote history — do not edit.

create table if not exists public.android_testers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.android_testers enable row level security;

-- Anonymous visitors may only insert (sign up). No select/update/delete.
create policy "anon can sign up"
  on public.android_testers
  for insert
  to anon
  with check (true);
