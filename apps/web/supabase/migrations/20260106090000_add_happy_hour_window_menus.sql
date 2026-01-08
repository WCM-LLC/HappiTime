-- Associate menus with happy hour windows.

create table if not exists public.happy_hour_window_menus (
  happy_hour_window_id uuid not null references public.happy_hour_windows(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (happy_hour_window_id, menu_id)
);

alter table public.happy_hour_window_menus enable row level security;

drop policy if exists "happy_hour_window_menus_select_member" on public.happy_hour_window_menus;
drop policy if exists "happy_hour_window_menus_insert_member" on public.happy_hour_window_menus;
drop policy if exists "happy_hour_window_menus_update_member" on public.happy_hour_window_menus;
drop policy if exists "happy_hour_window_menus_delete_member" on public.happy_hour_window_menus;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'is_org_member'
      and pg_function_is_visible(oid)
  ) then
    execute
      'create policy "happy_hour_window_menus_select_member"
       on public.happy_hour_window_menus
       for select
       to authenticated
       using (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.venues v on v.id = hw.venue_id
           where hw.id = happy_hour_window_id
             and public.is_org_member(v.org_id)
         )
       )';

    execute
      'create policy "happy_hour_window_menus_insert_member"
       on public.happy_hour_window_menus
       for insert
       to authenticated
       with check (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.menus mn on mn.venue_id = hw.venue_id
           join public.venues v on v.id = hw.venue_id
           where hw.id = happy_hour_window_id
             and mn.id = menu_id
             and public.is_org_member(v.org_id)
         )
       )';

    execute
      'create policy "happy_hour_window_menus_update_member"
       on public.happy_hour_window_menus
       for update
       to authenticated
       using (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.venues v on v.id = hw.venue_id
           where hw.id = happy_hour_window_id
             and public.is_org_member(v.org_id)
         )
       )
       with check (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.menus mn on mn.venue_id = hw.venue_id
           join public.venues v on v.id = hw.venue_id
           where hw.id = happy_hour_window_id
             and mn.id = menu_id
             and public.is_org_member(v.org_id)
         )
       )';

    execute
      'create policy "happy_hour_window_menus_delete_member"
       on public.happy_hour_window_menus
       for delete
       to authenticated
       using (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.venues v on v.id = hw.venue_id
           where hw.id = happy_hour_window_id
             and public.is_org_member(v.org_id)
         )
       )';
  else
    execute
      'create policy "happy_hour_window_menus_select_member"
       on public.happy_hour_window_menus
       for select
       to authenticated
       using (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.venues v on v.id = hw.venue_id
           join public.org_members m on m.org_id = v.org_id
           where hw.id = happy_hour_window_id
             and m.user_id = auth.uid()
         )
       )';

    execute
      'create policy "happy_hour_window_menus_insert_member"
       on public.happy_hour_window_menus
       for insert
       to authenticated
       with check (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.menus mn on mn.venue_id = hw.venue_id
           join public.venues v on v.id = hw.venue_id
           join public.org_members m on m.org_id = v.org_id
           where hw.id = happy_hour_window_id
             and mn.id = menu_id
             and m.user_id = auth.uid()
         )
       )';

    execute
      'create policy "happy_hour_window_menus_update_member"
       on public.happy_hour_window_menus
       for update
       to authenticated
       using (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.venues v on v.id = hw.venue_id
           join public.org_members m on m.org_id = v.org_id
           where hw.id = happy_hour_window_id
             and m.user_id = auth.uid()
         )
       )
       with check (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.menus mn on mn.venue_id = hw.venue_id
           join public.venues v on v.id = hw.venue_id
           join public.org_members m on m.org_id = v.org_id
           where hw.id = happy_hour_window_id
             and mn.id = menu_id
             and m.user_id = auth.uid()
         )
       )';

    execute
      'create policy "happy_hour_window_menus_delete_member"
       on public.happy_hour_window_menus
       for delete
       to authenticated
       using (
         exists (
           select 1
           from public.happy_hour_windows hw
           join public.venues v on v.id = hw.venue_id
           join public.org_members m on m.org_id = v.org_id
           where hw.id = happy_hour_window_id
             and m.user_id = auth.uid()
         )
       )';
  end if;
end $$;
