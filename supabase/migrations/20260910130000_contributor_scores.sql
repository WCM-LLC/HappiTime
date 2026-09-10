-- What a contribution is worth.
--
-- Weights: a menu is 10, an event 3, a window 1. Menus dominate because
-- adding Happy Hour menus is the behaviour this rewards, and a menu is also
-- the most work — sections, items, prices.
--
-- Only super users and regular users score. Owners, managers and hosts are
-- attributed on the rows for audit, but scanning your own venue is job
-- function, not the game, and an owner signs off on every intake entry anyway.
--
-- Window is 90 days on published_at, matching toastmaker_scores' cadence.
-- Copies (source_menu_id is not null) are excluded: crediting them would let
-- one menu be farmed across every venue in an org.

create or replace view public.contributor_scores as
with contributions as (
  select m.created_by as user_id, m.created_by_tier as tier, v.city,
         1 as menus, 0 as windows, 0 as events
    from public.menus m
    join public.venues v on v.id = m.venue_id
   where m.created_by is not null
     and m.created_by_tier in ('super_user', 'user')
     and m.status = 'published'
     and m.source_menu_id is null
     and m.published_at > now() - interval '90 days'

  union all

  select w.created_by, w.created_by_tier, v.city, 0, 1, 0
    from public.happy_hour_windows w
    join public.venues v on v.id = w.venue_id
   where w.created_by is not null
     and w.created_by_tier in ('super_user', 'user')
     and w.status = 'published'
     and w.published_at > now() - interval '90 days'

  union all

  select e.created_by, e.created_by_tier, v.city, 0, 0, 1
    from public.venue_events e
    join public.venues v on v.id = e.venue_id
   where e.created_by is not null
     and e.created_by_tier in ('super_user', 'user')
     and e.status = 'published'
     and e.published_at > now() - interval '90 days'
)
select user_id,
       tier,
       city,
       sum(menus)   as menus,
       sum(windows) as windows,
       sum(events)  as events,
       sum(menus) * 10 + sum(events) * 3 + sum(windows) * 1 as score
  from contributions
 group by user_id, tier, city;

-- Same treatment as toastmaker_scores in 20260811173852: this is an internal
-- scoring surface exposing per-user activity across venues. Piece 3's
-- SECURITY DEFINER function will be its only reader, returning nothing but
-- rank, handle and score.
alter view public.contributor_scores set (security_invoker = on);
revoke all on public.contributor_scores from anon, authenticated;
