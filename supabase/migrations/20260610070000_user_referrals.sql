-- Person-grain referral spine: "who brought you" (one referrer per referee,
-- first-wins via PK). Shared with Phase 3 Toastmaker; idempotent DDL so either
-- migration may land first. Writes go ONLY through record_referral (forge-proof:
-- referee is derived from auth.uid()) or the server-side invite-claim path.
create table if not exists public.user_referrals (
  referee_user_id  uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_handle  text,
  source           text not null check (source in ('share','invite','code')),
  created_at       timestamptz not null default now(),
  check (referee_user_id <> referrer_user_id)
);
create index if not exists user_referrals_referrer_idx
  on public.user_referrals (referrer_user_id);

alter table public.user_referrals enable row level security;
-- A user may read their own referral edge (who referred them / whom they referred).
drop policy if exists "user_referrals_select_related" on public.user_referrals;
create policy "user_referrals_select_related" on public.user_referrals
  for select to authenticated
  using (referee_user_id = auth.uid() or referrer_user_id = auth.uid());
-- No client INSERT/UPDATE/DELETE policy: the only client write path is the RPC.
grant select on public.user_referrals to authenticated;

-- Forge-proof referral capture. referee is ALWAYS auth.uid(); a caller can only
-- ever set who referred THEM. First-wins via PK conflict. 'invite' is reserved
-- for the server-side claim path and rejected here.
create or replace function public.record_referral(
  p_referrer_handle text,
  p_source text default 'share'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_referrer uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_source not in ('share','code') then raise exception 'invalid source'; end if;

  select user_id into v_referrer
  from public.user_profiles
  where lower(handle) = lower(regexp_replace(p_referrer_handle, '^@', ''))
  limit 1;
  if v_referrer is null then return null; end if;        -- unknown handle: no-op
  if v_referrer = auth.uid() then return null; end if;    -- no self-referral

  insert into public.user_referrals (referee_user_id, referrer_user_id, referrer_handle, source)
  values (auth.uid(), v_referrer, lower(regexp_replace(p_referrer_handle, '^@', '')), p_source)
  on conflict (referee_user_id) do nothing;              -- first-wins
  return v_referrer;
end; $$;
revoke all on function public.record_referral(text, text) from public;
grant execute on function public.record_referral(text, text) to authenticated;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- drop function if exists public.record_referral(text, text);
-- drop table if exists public.user_referrals cascade;
