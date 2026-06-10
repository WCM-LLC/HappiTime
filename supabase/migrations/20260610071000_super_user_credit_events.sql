-- Content-grain attribution ledger for actions that DON'T fit the one-row-per-
-- referee user_referrals (a user can save many shared itineraries from many
-- Insiders). Currently: share-level itinerary saves. Append-only; writes happen
-- inside copy_shared_itinerary (SECURITY DEFINER), never from a client policy.
create table if not exists public.super_user_credit_events (
  id             uuid primary key default gen_random_uuid(),
  super_user_id  uuid not null references auth.users(id) on delete cascade,  -- the sharer
  actor_user_id  uuid not null references auth.users(id) on delete cascade,  -- who saved
  kind           text not null check (kind in ('itinerary_save')),
  subject_id     uuid not null,                                              -- source list id
  created_at     timestamptz not null default now(),
  check (super_user_id <> actor_user_id),
  unique (actor_user_id, subject_id)
);
create index if not exists super_user_credit_events_su_idx
  on public.super_user_credit_events (super_user_id, created_at desc);

alter table public.super_user_credit_events enable row level security;
drop policy if exists "suce_select_own" on public.super_user_credit_events;
create policy "suce_select_own" on public.super_user_credit_events
  for select to authenticated
  using (super_user_id = auth.uid() or public.is_happitime_admin());
-- No client write policy: written only inside copy_shared_itinerary / service-role.
grant select on public.super_user_credit_events to authenticated;

-- Extend the existing copy-a-shared-itinerary RPC: after the copy, if the source
-- list's owner is a super_user (and not the caller), record one credit event.
create or replace function public.copy_shared_itinerary(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_src_id uuid;
  v_src_owner uuid;
  v_name text;
  v_desc text;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select id, user_id, name, description
    into v_src_id, v_src_owner, v_name, v_desc
  from public.user_lists
  where share_token = p_token;

  if v_src_id is null then
    return null;  -- unknown / revoked token
  end if;

  insert into public.user_lists (user_id, name, description, visibility)
  values (v_uid, left(coalesce(v_name, 'Itinerary') || ' (saved)', 100), v_desc, 'private')
  returning id into v_new_id;

  insert into public.user_list_items (list_id, venue_id, sort_order, notes)
  select v_new_id, i.venue_id, i.sort_order, i.notes
  from public.user_list_items i
  where i.list_id = v_src_id;

  -- Share-level Insider credit (idempotent; never self-credit).
  if v_src_owner is not null and v_src_owner <> v_uid
     and exists (select 1 from public.user_profiles p
                 where p.user_id = v_src_owner and p.role = 'super_user') then
    insert into public.super_user_credit_events (super_user_id, actor_user_id, kind, subject_id)
    values (v_src_owner, v_uid, 'itinerary_save', v_src_id)
    on conflict (actor_user_id, subject_id) do nothing;
  end if;

  return v_new_id;
end;
$$;
revoke all on function public.copy_shared_itinerary(uuid) from public;
grant execute on function public.copy_shared_itinerary(uuid) to authenticated;

-- ── DOWN (manual) ──────────────────────────────────────────────────────────
-- (restore prior copy_shared_itinerary body from 20260609220000; )
-- drop table if exists public.super_user_credit_events cascade;
