-- Listing verification loop (Phase 0 + 1 of Verification Loop Spec v1, Jun 11 2026).
-- Trigger: Tannin stale-listing incident — founder caught wrong menu in person.
--
-- Phase 0: revive the dormant last_confirmed_at columns (exist since init_core_schema,
--          never written by app code). Any content edit to a venue's happy hour
--          windows/offers now counts as verification and touches the venue stamp.
-- Phase 1: listing_reports — consumer "Something's off" reports. 2+ distinct
--          reporters on one venue within 14 days auto-marks the listing disputed;
--          any re-verification clears the dispute.
--
-- Writes: listing_reports INSERT directly by authenticated users (low-risk, RLS-
-- guarded, one open report per user/venue/type). Resolution (status changes) is
-- service-role only — no UPDATE policy on purpose.
-- SELECT pattern matches checkins: row owner OR org member of the venue's org.
--
-- NOT in this migration (needs edge function work):
--   • email notification to admin on new report (piggyback on digest infra later)
--   • Rounds credit for confirmed reports (blocked: full Rounds ledger)

-- ── venues: dispute flag ─────────────────────────────────────────────────────
alter table public.venues
  add column if not exists listing_disputed boolean not null default false;

-- ── backfill dormant last_confirmed_at ───────────────────────────────────────
update public.venues
   set last_confirmed_at = greatest(
         coalesce(updated_at, created_at),
         coalesce(published_at, created_at)
       )
 where last_confirmed_at is null;

update public.happy_hour_windows
   set last_confirmed_at = coalesce(updated_at, created_at)
 where last_confirmed_at is null;

-- ── verification touch triggers ──────────────────────────────────────────────
-- Window content edits stamp the window itself…
create or replace function public.touch_window_confirmed()
  returns trigger language plpgsql as $$
begin
  new.last_confirmed_at := now();
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'happy_hour_windows_touch_confirmed'
  ) then
    create trigger happy_hour_windows_touch_confirmed
    before insert or update on public.happy_hour_windows
    for each row execute function public.touch_window_confirmed();
  end if;
end $$;

-- …and window/offer edits stamp the parent venue + clear any dispute.
create or replace function public.touch_venue_confirmed()
  returns trigger language plpgsql security definer as $$
begin
  update public.venues
     set last_confirmed_at = now(),
         listing_disputed  = false
   where id = new.venue_id;
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'happy_hour_windows_touch_venue'
  ) then
    create trigger happy_hour_windows_touch_venue
    after insert or update on public.happy_hour_windows
    for each row execute function public.touch_venue_confirmed();
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'happy_hour_offers_touch_venue'
  ) then
    create trigger happy_hour_offers_touch_venue
    after insert or update on public.happy_hour_offers
    for each row execute function public.touch_venue_confirmed();
  end if;
end $$;

-- Direct re-verify on the venue row (portal "Still accurate?" one-tap) also
-- clears the dispute flag.
create or replace function public.clear_dispute_on_confirm()
  returns trigger language plpgsql as $$
begin
  if new.last_confirmed_at is distinct from old.last_confirmed_at then
    new.listing_disputed := false;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'venues_clear_dispute_on_confirm'
  ) then
    create trigger venues_clear_dispute_on_confirm
    before update on public.venues
    for each row execute function public.clear_dispute_on_confirm();
  end if;
end $$;

-- ── listing_reports ──────────────────────────────────────────────────────────
create table if not exists public.listing_reports (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  venue_id    uuid        not null references public.venues(id) on delete cascade,
  window_id   uuid        references public.happy_hour_windows(id) on delete set null,
  report_type text        not null check (report_type in ('hours_wrong','menu_or_price_wrong','deal_not_honored')),
  note        text,
  photo_url   text,
  status      text        not null default 'open' check (status in ('open','confirmed','rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- One OPEN report per user/venue/type — dedupes taps, blocks spam.
create unique index if not exists listing_reports_open_unique
  on public.listing_reports (user_id, venue_id, report_type)
  where status = 'open';
create index if not exists listing_reports_venue_status_idx
  on public.listing_reports (venue_id, status);

alter table public.listing_reports enable row level security;

drop policy if exists "listing_reports_insert_self" on public.listing_reports;
create policy "listing_reports_insert_self"
  on public.listing_reports for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "listing_reports_select_self_or_org" on public.listing_reports;
create policy "listing_reports_select_self_or_org"
  on public.listing_reports for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.venues v
      join public.org_members om on om.org_id = v.org_id
      where v.id = listing_reports.venue_id
        and om.user_id = auth.uid()
    )
  );

grant select, insert on public.listing_reports to authenticated;

-- ── auto-dispute: 2+ distinct open reporters in 14 days ──────────────────────
create or replace function public.flag_disputed_on_report()
  returns trigger language plpgsql security definer as $$
begin
  if (
    select count(distinct lr.user_id)
    from public.listing_reports lr
    where lr.venue_id = new.venue_id
      and lr.status = 'open'
      and lr.created_at > now() - interval '14 days'
  ) >= 2 then
    update public.venues
       set listing_disputed = true
     where id = new.venue_id;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'listing_reports_flag_disputed'
  ) then
    create trigger listing_reports_flag_disputed
    after insert on public.listing_reports
    for each row execute function public.flag_disputed_on_report();
  end if;
end $$;

-- ── DOWN (manual rollback) ───────────────────────────────────────────────────
-- drop trigger if exists listing_reports_flag_disputed on public.listing_reports;
-- drop function if exists public.flag_disputed_on_report();
-- drop table if exists public.listing_reports cascade;
-- drop trigger if exists venues_clear_dispute_on_confirm on public.venues;
-- drop function if exists public.clear_dispute_on_confirm();
-- drop trigger if exists happy_hour_offers_touch_venue on public.happy_hour_offers;
-- drop trigger if exists happy_hour_windows_touch_venue on public.happy_hour_windows;
-- drop function if exists public.touch_venue_confirmed();
-- drop trigger if exists happy_hour_windows_touch_confirmed on public.happy_hour_windows;
-- drop function if exists public.touch_window_confirmed();
-- alter table public.venues drop column if exists listing_disputed;
