-- RECONSTRUCTED FILE — original was never committed (see
-- 20260817004840_prevent_duplicate_places_id_venues.sql for the full explanation).
--
-- Body below is read back verbatim from prod (`pg_get_functiondef` / `pg_get_indexdef` /
-- `pg_get_triggerdef`), so it reproduces the end state this migration actually left on prod.
-- Statement ORDER and any transient steps of the original are not recoverable; only the end
-- state is, and that is what a replay needs.
--
-- Blocks a second active venue from claiming a Google Place already held by another.
-- Interactive callers get a unique_violation; the service_role Places sync instead quarantines
-- the row so one duplicate cannot break a whole batch.
--
-- Idempotent. Never executes against prod (version already in prod's ledger).

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

create index if not exists venues_places_id_idx
  on public.venues using btree (places_id)
  where (places_id is not null);

create or replace trigger venues_block_duplicate_places_id_trg
  before insert or update of places_id, status on public.venues
  for each row execute function public.venues_block_duplicate_places_id();
