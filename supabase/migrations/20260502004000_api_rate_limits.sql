create table if not exists public.api_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limits disable row level security;

revoke all on table public.api_rate_limits from anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_count integer;
begin
  if p_key is null or p_key = '' or p_limit <= 0 or p_window_seconds <= 0 then
    return false;
  end if;

  insert into public.api_rate_limits as rl (key, window_start, count, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (key) do update
    set count = case
      when rl.window_start <= v_window_start then 1
      else rl.count + 1
    end,
    window_start = case
      when rl.window_start <= v_window_start then v_now
      else rl.window_start
    end,
    updated_at = v_now
  returning rl.count into v_count;

  return v_count > p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

