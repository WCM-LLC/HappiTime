-- Schema-drift back-fill (1 of 3): capture `venues_normalize_tags` + its trigger.
--
-- These were created out-of-band on prod and never committed, so a clean migration replay
-- stopped reproducing prod's schema. The nightly `schema-parity` gate has failed every night
-- since 2026-08-17 as a result. Method follows the 2026-06-01 reconciliation plan: prod is the
-- intended target, reconcile FORWARD, every statement a verified NO-OP against current prod.
--
-- Body is verbatim from prod `pg_get_functiondef`. Normalizes venues.tags on write:
-- trims, lowercases, maps '_' -> '-', drops blanks, de-duplicates, preserves first-seen order.
--
-- IDEMPOTENT / no-op on prod.

create or replace function public.venues_normalize_tags()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.tags is null or array_length(new.tags, 1) is null then
    return new;
  end if;

  new.tags := (
    select array_agg(t order by ord)
    from (
      select distinct on (norm) norm as t, ord
      from (
        select lower(replace(trim(x), '_', '-')) as norm, ord
        from unnest(new.tags) with ordinality as u(x, ord)
        where coalesce(trim(x), '') <> ''
      ) n
      order by norm, ord
    ) s
  );

  return new;
end;
$function$;

-- prod ACL is `postgres=X/postgres | service_role=X/postgres` — PUBLIC/anon/authenticated hold
-- no EXECUTE. A fresh replay would grant PUBLIC by default, so revoke to match prod.
revoke all on function public.venues_normalize_tags() from public, anon, authenticated;
grant execute on function public.venues_normalize_tags() to service_role;

-- `create or replace trigger` (PG14+) is atomic — unlike drop+create it leaves no window in
-- which a write to the live `venues` table could bypass normalization.
create or replace trigger venues_normalize_tags_trg
  before insert or update of tags on public.venues
  for each row execute function public.venues_normalize_tags();
