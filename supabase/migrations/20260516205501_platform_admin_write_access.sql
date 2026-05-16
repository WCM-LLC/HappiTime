-- Platform admin write access and org-role helper fixes.
--
-- The web console uses the service-role client for platform-admin writes, but
-- these RLS policies keep direct authenticated writes coherent too. The helper
-- intentionally checks the DB-managed admin_users table, not user_metadata.
--
-- Some production schema changes were applied directly, so this migration skips
-- optional normalized tables when they are absent.

do $apply$
declare
  table_name text;
  admin_tables text[] := array[
    'organizations',
    'org_members',
    'venues',
    'venue_members',
    'org_invites',
    'happy_hour_windows',
    'happy_hour_offers',
    'happy_hour_window_days',
    'happy_hour_offer_windows',
    'menus',
    'menu_sections',
    'menu_items',
    'menu_item_base_prices',
    'happy_hour_window_menus',
    'happy_hour_menu_item_prices',
    'venue_media',
    'venue_events',
    'venue_tags',
    'event_media',
    'events',
    'approved_tags'
  ];
begin
  execute $sql$
    create or replace function public.is_platform_admin()
    returns boolean
    language sql stable
    security definer
    set search_path = public, auth
    as $function$
      select exists (
        select 1
        from public.admin_users au
        where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
    $function$;
  $sql$;

  execute 'revoke all on function public.is_platform_admin() from public';
  execute 'grant execute on function public.is_platform_admin() to authenticated, service_role';

  -- Keep org-scoped roles scoped to the requested org. The previous OR clauses
  -- could treat a role in any org as global access.
  execute $sql$
    create or replace function public.is_org_owner(p_org_id uuid)
    returns boolean
    language sql stable
    security definer
    set search_path = public
    as $function$
      select exists (
        select 1
        from public.org_members m
        where m.org_id = p_org_id
          and m.user_id = auth.uid()
          and m.role in ('owner', 'admin')
      );
    $function$;
  $sql$;

  execute $sql$
    create or replace function public.is_org_host(p_org_id uuid)
    returns boolean
    language sql stable
    security definer
    set search_path = public
    as $function$
      select exists (
        select 1
        from public.org_members m
        where m.org_id = p_org_id
          and m.user_id = auth.uid()
          and m.role in ('host', 'admin')
      );
    $function$;
  $sql$;

  foreach table_name in array admin_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
      execute format('drop policy if exists "platform_admin_all" on public.%I', table_name);
      execute format(
        'create policy "platform_admin_all" on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
        table_name
      );
    end if;
  end loop;

  notify pgrst, 'reload schema';
end
$apply$;
