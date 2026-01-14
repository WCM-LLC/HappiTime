-- Attach updated_at triggers (idempotent).

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'organizations_set_updated_at'
  ) then
    create trigger organizations_set_updated_at
    before update on public.organizations
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'org_members_set_updated_at'
  ) then
    create trigger org_members_set_updated_at
    before update on public.org_members
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'venues_set_updated_at'
  ) then
    create trigger venues_set_updated_at
    before update on public.venues
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'venue_members_set_updated_at'
  ) then
    create trigger venue_members_set_updated_at
    before update on public.venue_members
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'org_invites_set_updated_at'
  ) then
    create trigger org_invites_set_updated_at
    before update on public.org_invites
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'happy_hour_windows_set_updated_at'
  ) then
    create trigger happy_hour_windows_set_updated_at
    before update on public.happy_hour_windows
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'happy_hour_offers_set_updated_at'
  ) then
    create trigger happy_hour_offers_set_updated_at
    before update on public.happy_hour_offers
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'menus_set_updated_at') then
    create trigger menus_set_updated_at
    before update on public.menus
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'menu_sections_set_updated_at') then
    create trigger menu_sections_set_updated_at
    before update on public.menu_sections
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'menu_items_set_updated_at') then
    create trigger menu_items_set_updated_at
    before update on public.menu_items
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'happy_hour_window_menus_set_updated_at') then
    create trigger happy_hour_window_menus_set_updated_at
    before update on public.happy_hour_window_menus
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'venue_media_set_updated_at') then
    create trigger venue_media_set_updated_at
    before update on public.venue_media
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'happy_hour_places_set_updated_at') then
    create trigger happy_hour_places_set_updated_at
    before update on public.happy_hour_places
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- user_push_tokens is created in a later migration in this repo.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_push_tokens'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'user_push_tokens_set_updated_at') then
      create trigger user_push_tokens_set_updated_at
      before update on public.user_push_tokens
      for each row execute function public.set_updated_at();
    end if;
  end if;
end $$;

