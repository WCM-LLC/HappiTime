-- Harden venue billing rows so Stripe/admin writes cannot associate a venue
-- subscription with the wrong organization.

create or replace function public.enforce_venue_subscription_org_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  venue_org_id uuid;
begin
  select org_id
    into venue_org_id
    from public.venues
   where id = new.venue_id;

  if venue_org_id is null then
    raise exception 'venue_subscriptions.venue_id % does not reference an existing venue', new.venue_id
      using errcode = '23503';
  end if;

  if new.org_id is null then
    new.org_id := venue_org_id;
  elsif new.org_id <> venue_org_id then
    raise exception 'venue_subscriptions.org_id must match venues.org_id for venue %', new.venue_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists venue_subscriptions_org_match
  on public.venue_subscriptions;

create trigger venue_subscriptions_org_match
  before insert or update of venue_id, org_id
  on public.venue_subscriptions
  for each row execute function public.enforce_venue_subscription_org_match();
