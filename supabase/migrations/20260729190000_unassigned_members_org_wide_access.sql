-- An invited manager (or host) with no venue_members rows was locked out of
-- every venue: 38 policies across venues / menus / happy-hour / media / events
-- gate non-owner writes on has_venue_assignment(), and the invite UI allows
-- creating members with zero venue selections (venue checkboxes optional;
-- access-actions only writes venue_members `if (venueIds.length)`).
--
-- Owner decision 2026-07-29: zero explicit assignments in an org = access to
-- ALL of that org's venues, including venues created later. Explicit
-- assignments still restrict to exactly those venues.
--
-- Redefining the helper (rather than rewriting 38 policies) applies the rule
-- everywhere at once. Policies still AND it with is_org_manager()/is_org_host(),
-- so non-members and out-of-role members remain excluded. The app-layer gate in
-- apps/web/src/actions/venue-actions.ts mirrors this rule.

create or replace function public.has_venue_assignment(p_venue_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select
    exists (
      -- explicitly assigned to this venue
      select 1
      from public.venue_members vm
      where vm.venue_id = p_venue_id
        and vm.user_id = auth.uid()
    )
    or (
      -- org member with zero explicit assignments anywhere in this venue's org
      exists (
        select 1
        from public.org_members m
        where m.user_id = auth.uid()
          and m.org_id = (select org_id from public.venues where id = p_venue_id)
      )
      and not exists (
        select 1
        from public.venue_members vm
        where vm.user_id = auth.uid()
          and vm.org_id = (select org_id from public.venues where id = p_venue_id)
      )
    );
$$;
