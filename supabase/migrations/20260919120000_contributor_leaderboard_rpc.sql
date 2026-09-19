-- The public read path for the contributor leaderboard.
--
-- contributor_scores is revoked from anon and authenticated: it exposes
-- per-user activity across every venue, the same shape that got
-- toastmaker_scores locked down in 20260811173852. This function is its only
-- reader, so what it returns IS the public surface.
--
-- It deliberately does not return user_id. A handle is public because the user
-- chose to set one; a user id is a join key into everything else. A boundary
-- that hands out identifiers is not a boundary.
--
-- It also requires is_public. As a definer it bypasses the user_profiles RLS
-- policy that gates anon reads on is_public, so it applies that gate itself: a
-- user who made their profile private does not appear on a public ranking.
--
-- One board, not one per city: the ten published cities are a single metro
-- (174 venues in Kansas City, 1-6 in each of the others), so ranking per city
-- would split a contributor's score and make "#1 in Westwood" meaningless.
-- primary_city comes back for display, and for sectioning later behind a
-- p_city filter parameter.

create or replace function public.contributor_leaderboard(p_limit int default 10)
returns table (
  rank          int,
  handle        text,
  score         bigint,
  menus         bigint,
  windows       bigint,
  events        bigint,
  is_toastmaker boolean,
  primary_city  text
)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select cs.user_id,
           sum(cs.score)::bigint   as score,
           sum(cs.menus)::bigint   as menus,
           sum(cs.windows)::bigint as windows,
           sum(cs.events)::bigint  as events,
           -- Where they earned the most; alphabetical break so the value is
           -- stable across calls rather than arbitrary.
           (array_agg(cs.city order by cs.score desc, cs.city asc))[1] as primary_city
      from public.contributor_scores cs
     group by cs.user_id
  ),
  current_toastmakers as (
    -- Same expression ratify uses in 20260610220000_toastmaker.sql.
    select distinct vt.user_id
      from public.venue_toastmakers vt
     where vt.quarter = to_char((now() at time zone 'utc'),'YYYY') || '-Q' || extract(quarter from (now() at time zone 'utc'))::int
  )
  select dense_rank() over (order by t.score desc)::int as rank,
         p.handle,
         t.score,
         t.menus,
         t.windows,
         t.events,
         (ct.user_id is not null) as is_toastmaker,
         t.primary_city
    from totals t
    join public.user_profiles p on p.user_id = t.user_id
    left join current_toastmakers ct on ct.user_id = t.user_id
   where p.handle is not null
     and p.is_public
     and t.score > 0
   order by t.score desc, p.handle asc
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- The only door. contributor_scores itself stays revoked.
revoke all on function public.contributor_leaderboard(int) from public;
grant execute on function public.contributor_leaderboard(int) to anon, authenticated;
