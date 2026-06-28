-- Recovered from prod (supabase_migrations.schema_migrations) to reconcile drift:
-- this was applied out-of-band on 2026-06-21 and never committed. Content is the
-- exact recorded statement. See [[zero-migration-drift]] discipline.

-- Anti-spam cooldown for the "I'm here" presence tap (venue_visits).
-- Independent of happy hour and of the code-verification flow (public.checkins).
-- If the same user has an "I'm here" visit at the same venue within the cooldown
-- window, the new insert is silently dropped (returns NULL -> no row, no error).

create or replace function public.enforce_venue_visit_cooldown()
returns trigger
language plpgsql
as $$
declare
  -- single place to tune the cooldown
  cooldown constant interval := interval '3 hours';
  recent_count integer;
begin
  select count(*) into recent_count
  from public.venue_visits v
  where v.user_id = NEW.user_id
    and v.venue_id = NEW.venue_id
    and v.entered_at > (coalesce(NEW.entered_at, now()) - cooldown);

  if recent_count > 0 then
    -- within cooldown: silently ignore this tap
    return null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_venue_visit_cooldown on public.venue_visits;

create trigger trg_venue_visit_cooldown
  before insert on public.venue_visits
  for each row
  execute function public.enforce_venue_visit_cooldown();
