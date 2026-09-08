-- RECONSTRUCTED FILE — original was never committed (see
-- 20260817004840_prevent_duplicate_places_id_venues.sql for the full explanation).
--
-- Body read back verbatim from prod. Normalizes venues.tags on write: trims, lowercases,
-- maps '_' -> '-', drops blanks, de-duplicates, preserves first-seen order.
--
-- NOT RECOVERABLE: whether the original also ran a one-off UPDATE to normalize tags already in
-- the table. If it did, that backfill has already happened on prod and cannot be replayed from
-- here; on a fresh replay there are no rows to normalize, so its absence changes nothing about
-- the end state. Schema parity is unaffected either way.
--
-- Idempotent. Never executes against prod (version already in prod's ledger).

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

revoke all on function public.venues_normalize_tags() from public, anon, authenticated;
grant execute on function public.venues_normalize_tags() to service_role;

create or replace trigger venues_normalize_tags_trg
  before insert or update of tags on public.venues
  for each row execute function public.venues_normalize_tags();
