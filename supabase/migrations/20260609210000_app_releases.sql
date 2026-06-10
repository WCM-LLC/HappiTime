-- Store-version release notes for the in-app "update available" prompt.
create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios','android','all')),
  version text not null,
  changelog text[] not null default '{}',
  is_critical boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.app_releases enable row level security;
-- No public RLS policies: all reads go through the SECURITY DEFINER RPC below;
-- writes are service-role/admin only.

-- Latest published release for a platform ('all' rows apply to every platform).
create or replace function public.get_latest_release(p_platform text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', r.version,
    'changelog', r.changelog,
    'is_critical', r.is_critical
  )
  from public.app_releases r
  where r.is_published = true
    and (r.platform = p_platform or r.platform = 'all')
  order by r.published_at desc
  limit 1;
$$;

revoke all on function public.get_latest_release(text) from public;
grant execute on function public.get_latest_release(text) to anon, authenticated;
