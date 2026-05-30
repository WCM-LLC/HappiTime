-- QR / push / organic / in-app attribution layer. Distinct from venue_visits
-- (which is authenticated, user-owned, carries dwell+ratings+friend-privacy and
-- whose RLS requires user_id=auth.uid()). Attribution events are anonymous-friendly:
-- nullable user_id + anonymous session_id, optional coarse geo. Writes happen ONLY
-- through the service-role `track-visit` edge function (no direct anon/auth insert
-- policy), which enforces slug resolution + rate limiting.
--
-- Applied to remote via Supabase MCP apply_migration (name: venue_attribution_events).

create table if not exists public.venue_attribution_events (
  id          uuid        primary key default gen_random_uuid(),
  venue_id    uuid        not null references public.venues(id) on delete cascade,
  source      text        not null
                check (source in ('qr','app_checkin','push_click','organic')),
  user_id     uuid        references auth.users(id) on delete set null,  -- null = anonymous
  session_id  text,                                                       -- anonymous device id
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);

-- Dashboard reads: per-venue, recent-first (Phase 4).
create index if not exists venue_attribution_events_venue_idx
  on public.venue_attribution_events (venue_id, created_at desc);
-- Rate-limit / dedupe support lookups by (venue, session).
create index if not exists venue_attribution_events_session_idx
  on public.venue_attribution_events (venue_id, session_id, created_at desc)
  where session_id is not null;

alter table public.venue_attribution_events enable row level security;

-- SELECT: org members of the venue's org (matches venue_subscriptions pattern).
drop policy if exists "venue_attribution_events_select_org_member" on public.venue_attribution_events;
create policy "venue_attribution_events_select_org_member"
  on public.venue_attribution_events for select to authenticated
  using (exists (
    select 1
    from public.venues v
    join public.org_members om on om.org_id = v.org_id
    where v.id = venue_attribution_events.venue_id
      and om.user_id = auth.uid()
  ));

-- No INSERT/UPDATE/DELETE policy: writes are service-role only (edge function),
-- which bypasses RLS. This keeps the anonymous-write surface entirely server-side.
grant select on public.venue_attribution_events to authenticated;

-- ── DOWN (manual rollback) ───────────────────────────────────────────────────
-- drop table if exists public.venue_attribution_events cascade;
