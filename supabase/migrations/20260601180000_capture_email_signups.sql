-- Schema-drift reconciliation, Stage 5: capture public.email_signups.
-- Plan: docs/superpowers/plans/2026-06-01-schema-drift-reconciliation.md (prod = target).
--
-- The coming-soon email-signup table was built on prod (dashboard) and never committed, so a
-- fresh replay lacked the table apps/directory/src/app/coming-soon.tsx writes to. Captures
-- prod's exact definition.
--
-- IDEMPOTENT / no-op on prod: table IF NOT EXISTS (inline identity PK + unique), index
-- IF NOT EXISTS, policy drop-then-create, grants idempotent.
--
-- The anon-INSERT policy is intentional (public signup form); anon has only INSERT (RLS denies
-- select/update/delete), so this is not an over-permissive exposure — no hardening needed.

create table if not exists public.email_signups (
  id         bigint generated always as identity,
  email      text not null,
  source     text not null default 'coming_soon',
  created_at timestamptz not null default now(),
  constraint email_signups_pkey primary key (id),
  constraint email_signups_email_key unique (email)
);

create index if not exists idx_email_signups_email on public.email_signups using btree (email);

alter table public.email_signups enable row level security;
drop policy if exists "Allow anonymous inserts" on public.email_signups;
create policy "Allow anonymous inserts" on public.email_signups for insert to anon with check (true);

grant all on table public.email_signups to anon, authenticated, service_role;
