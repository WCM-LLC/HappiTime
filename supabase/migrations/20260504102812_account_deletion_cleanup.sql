-- Account deletion now archives anonymized app data, then removes the live
-- auth user so a future sign-in with the same credentials starts fresh.
--
-- The archive intentionally avoids auth user ids, emails, handles, names, bios,
-- comments, free-text list names/descriptions, push tokens, and share tokens.

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
revoke all on schema app_private from authenticated;

create table if not exists app_private.deleted_user_data_archives (
  id uuid primary key default gen_random_uuid(),
  archived_at timestamptz not null default now(),
  archive_version int not null default 1,
  reason text not null default 'account_deleted'
);

create table if not exists app_private.deleted_user_data_archive_items (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references app_private.deleted_user_data_archives(id) on delete cascade,
  source_table text not null,
  record_count bigint not null default 0,
  anonymized_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deleted_user_archive_items_archive_idx
  on app_private.deleted_user_data_archive_items (archive_id);

comment on table app_private.deleted_user_data_archives is
  'Anonymous account deletion archive. Does not store auth user ids, email addresses, handles, names, or other direct account identifiers.';

comment on table app_private.deleted_user_data_archive_items is
  'Sanitized summaries of deleted account data, keyed only by a random archive id.';

-- Older push token rows did not have a foreign key, so they would survive
-- auth deletion and reappear as stale device state. Remove existing orphans,
-- then cascade future rows with the account.
delete from public.user_push_tokens upt
where not exists (
  select 1
  from auth.users u
  where u.id = upt.user_id
);

do $$
begin
  if to_regclass('public.user_push_tokens') is not null
     and not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.user_push_tokens'::regclass
         and conname = 'user_push_tokens_user_id_fkey'
     ) then
    alter table public.user_push_tokens
      add constraint user_push_tokens_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- Directory tracking can retain anonymous analytics, but it must not block
-- deleting an account and must not keep a direct user relationship.
do $$
begin
  if to_regclass('public.directory_events') is not null then
    if exists (
      select 1
      from pg_constraint
      where conrelid = 'public.directory_events'::regclass
        and conname = 'directory_events_user_id_fkey'
    ) then
      alter table public.directory_events
        drop constraint directory_events_user_id_fkey;
    end if;

    alter table public.directory_events
      add constraint directory_events_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

create or replace function app_private.archive_auth_user_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_archive_id uuid;
begin
  insert into app_private.deleted_user_data_archives default values
  returning id into v_archive_id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'user_profiles',
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'had_handle', handle is not null,
          'had_display_name', display_name is not null,
          'had_avatar', avatar_url is not null,
          'had_bio', bio is not null,
          'was_public', is_public,
          'created_month', to_char(date_trunc('month', created_at), 'YYYY-MM')
        )
      ),
      '[]'::jsonb
    )
  from public.user_profiles
  where user_id = old.id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'user_preferences',
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'max_distance_miles', max_distance_miles,
            'price_tier_min', price_tier_min,
            'price_tier_max', price_tier_max,
            'cuisine_count', coalesce(array_length(cuisines, 1), 0),
            'notifications_marketing', notifications_marketing,
            'notifications_product', notifications_product,
            'notifications_push', notifications_push,
            'notifications_happy_hours', notifications_happy_hours,
            'notifications_venue_updates', notifications_venue_updates,
            'notifications_friend_activity', notifications_friend_activity,
            'default_checkin_privacy_set', default_checkin_privacy is not null
          )
        )
      ),
      '[]'::jsonb
    )
  from public.user_preferences
  where user_id = old.id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'user_lists',
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'visibility', l.visibility,
          'item_count', coalesce(i.item_count, 0),
          'created_month', to_char(date_trunc('month', l.created_at), 'YYYY-MM')
        )
      ),
      '[]'::jsonb
    )
  from public.user_lists l
  left join lateral (
    select count(*)::int as item_count
    from public.user_list_items uli
    where uli.list_id = l.id
  ) i on true
  where l.user_id = old.id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'user_events',
    coalesce(sum(event_count), 0),
    jsonb_build_object(
      'event_type_counts',
      coalesce(jsonb_object_agg(event_type, event_count), '{}'::jsonb),
      'venue_related_count',
      coalesce(sum(venue_related_count), 0)
    )
  from (
    select
      event_type,
      count(*)::bigint as event_count,
      count(*) filter (where venue_id is not null)::bigint as venue_related_count
    from public.user_events
    where user_id = old.id
    group by event_type
  ) s;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'user_followed_venues',
    count(*),
    jsonb_build_object('saved_venue_count', count(*))
  from public.user_followed_venues
  where user_id = old.id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'user_follows',
    count(*),
    jsonb_build_object(
      'following_count', count(*) filter (where follower_id = old.id),
      'follower_count', count(*) filter (where following_user_id = old.id)
    )
  from public.user_follows
  where follower_id = old.id
     or following_user_id = old.id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'user_plans',
    count(*),
    coalesce(
      jsonb_agg(jsonb_build_object('plan', plan, 'status', status)),
      '[]'::jsonb
    )
  from public.user_plans
  where user_id = old.id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'user_push_tokens',
    coalesce(sum(token_count), 0),
    jsonb_build_object(
      'platform_counts',
      coalesce(jsonb_object_agg(platform, token_count), '{}'::jsonb)
    )
  from (
    select platform, count(*)::bigint as token_count
    from public.user_push_tokens
    where user_id = old.id
    group by platform
  ) s;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'directory_events',
    coalesce(sum(event_count), 0),
    jsonb_build_object(
      'event_type_counts',
      coalesce(jsonb_object_agg(event_type, event_count), '{}'::jsonb)
    )
  from (
    select event_type, count(*)::bigint as event_count
    from public.directory_events
    where user_id = old.id
    group by event_type
  ) s;

  update public.directory_events
  set user_id = null
  where user_id = old.id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'events',
    coalesce(sum(event_count), 0),
    jsonb_build_object(
      'event_type_counts',
      coalesce(jsonb_object_agg(event_type, event_count), '{}'::jsonb)
    )
  from (
    select event_type, count(*)::bigint as event_count
    from public.events
    where user_id = old.id
    group by event_type
  ) s;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'org_members',
    coalesce(sum(member_count), 0),
    jsonb_build_object(
      'role_counts',
      coalesce(jsonb_object_agg(role, member_count), '{}'::jsonb)
    )
  from (
    select role, count(*)::bigint as member_count
    from public.org_members
    where user_id = old.id
    group by role
  ) s;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'venue_members',
    count(*),
    jsonb_build_object(
      'membership_count', count(*),
      'assigned_by_count', (
        select count(*)
        from public.venue_members
        where assigned_by = old.id
      )
    )
  from public.venue_members
  where user_id = old.id;

  insert into app_private.deleted_user_data_archive_items (
    archive_id,
    source_table,
    record_count,
    anonymized_data
  )
  select
    v_archive_id,
    'created_content',
    (
      (select count(*) from public.organizations where created_by = old.id) +
      (select count(*) from public.venue_media where created_by = old.id) +
      (select count(*) from public.venue_events where created_by = old.id)
    ),
    jsonb_build_object(
      'organizations_created_count', (
        select count(*) from public.organizations where created_by = old.id
      ),
      'venue_media_created_count', (
        select count(*) from public.venue_media where created_by = old.id
      ),
      'venue_events_created_count', (
        select count(*) from public.venue_events where created_by = old.id
      )
    );

  if to_regclass('public.user_venue_notification_blocks') is not null then
    execute $sql$
      insert into app_private.deleted_user_data_archive_items (
        archive_id,
        source_table,
        record_count,
        anonymized_data
      )
      select
        $1,
        'user_venue_notification_blocks',
        count(*),
        jsonb_build_object('blocked_venue_count', count(*))
      from public.user_venue_notification_blocks
      where user_id = $2
    $sql$ using v_archive_id, old.id;
  end if;

  if to_regclass('public.venue_visits') is not null then
    execute $sql$
      insert into app_private.deleted_user_data_archive_items (
        archive_id,
        source_table,
        record_count,
        anonymized_data
      )
      select
        $1,
        'venue_visits',
        count(*),
        jsonb_build_object('visit_count', count(*))
      from public.venue_visits
      where user_id = $2
    $sql$ using v_archive_id, old.id;

    execute 'delete from public.venue_visits where user_id = $1' using old.id;
  end if;

  return old;
end;
$$;

drop trigger if exists archive_auth_user_before_delete on auth.users;
create trigger archive_auth_user_before_delete
before delete on auth.users
for each row execute function app_private.archive_auth_user_before_delete();
