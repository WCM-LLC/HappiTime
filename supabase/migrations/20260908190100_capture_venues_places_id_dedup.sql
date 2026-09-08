-- Schema-drift back-fill (2 of 3): capture `venues_block_duplicate_places_id`, its trigger,
-- and the partial index `venues_places_id_idx`.
--
-- Created out-of-band on prod and never committed; see the header of
-- 20260908190000_capture_venues_normalize_tags.sql for the full context.
--
-- Behaviour (verbatim from prod `pg_get_functiondef`): blocks a second active venue from
-- claiming a Google Place already held by another. Interactive callers get a `unique_violation`
-- exception; the service_role Places sync instead quarantines the row (clears places_id, marks
-- places_status='skipped', flags needs_address_review) so one duplicate cannot break a batch.
--
-- SECURITY DEFINER with `set search_path` — required by the repo's function policy, and it is
-- how prod already defines it.
--
-- IDEMPOTENT / no-op on prod.

create or replace function public.venues_block_duplicate_places_id()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  existing record;
  jwt_role text := current_setting('request.jwt.claim.role', true);
begin
  if new.places_id is null or new.status = 'archived' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.places_id is not distinct from old.places_id then
    return new;
  end if;

  select v.id, v.name into existing
  from public.venues v
  where v.places_id = new.places_id
    and v.status <> 'archived'
    and v.id <> new.id
  limit 1;

  if existing.id is null then
    return new;
  end if;

  if jwt_role = 'service_role' then
    -- automated Places sync: quarantine this row for admin triage, don't break the batch
    new.places_id           := null;
    new.places_status       := 'skipped';
    new.places_next_sync_at := null;
    new.places_last_error   := format('duplicate_places_id: resolves to same Google Place as venue "%s" (%s)',
                                      existing.name, existing.id);
    new.needs_address_review := true;
    return new;
  end if;

  raise exception
    'Duplicate venue: places_id % is already used by active venue "%" (%). Update that venue instead of creating a new one.',
    new.places_id, existing.name, existing.id
    using errcode = 'unique_violation';
end;
$function$;

-- Matches prod's ACL (`postgres=X/postgres | service_role=X/postgres`). Doubly important here:
-- the function is SECURITY DEFINER, so PUBLIC EXECUTE — which a fresh replay grants by default —
-- would be a privilege escalation that prod does not have.
revoke all on function public.venues_block_duplicate_places_id() from public, anon, authenticated;
grant execute on function public.venues_block_duplicate_places_id() to service_role;

-- Partial index backing the duplicate lookup above (verbatim from prod `pg_get_indexdef`).
create index if not exists venues_places_id_idx
  on public.venues using btree (places_id)
  where (places_id is not null);

create or replace trigger venues_block_duplicate_places_id_trg
  before insert or update of places_id, status on public.venues
  for each row execute function public.venues_block_duplicate_places_id();
