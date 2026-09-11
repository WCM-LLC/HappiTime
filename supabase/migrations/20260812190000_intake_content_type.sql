-- Intake content classification: a scan can now be a happy hour, a dated
-- event, or a weekly series, so a submission has to record WHICH — a reviewer
-- opening the queue needs to know whether they are approving a menu or three
-- events before they click.
--
-- Append-only per docs/database-change-policy.md.

alter table public.intake_submissions
  add column if not exists content_type text not null default 'happy_hour'
    check (content_type in ('happy_hour', 'event', 'event_series', 'mixed'));

comment on column public.intake_submissions.content_type is
  'What the submitter confirmed the scan was. Existing rows predate events, so the default is happy_hour.';

-- Events created by a submission. A single scan of a flyer can produce several,
-- so this is a join table rather than a column. Deleting the event drops the
-- link; deleting the submission keeps neither.
create table if not exists public.intake_submission_events (
  submission_id uuid not null
    references public.intake_submissions(id) on delete cascade,
  event_id uuid not null
    references public.venue_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (submission_id, event_id)
);

-- The PK covers (submission_id, event_id); the reverse lookup ("which
-- submission produced this event?") needs its own index.
create index if not exists intake_submission_events_event_id_idx
  on public.intake_submission_events (event_id);

alter table public.intake_submission_events enable row level security;

-- Readable by exactly whoever can already see the parent submission: its
-- submitter, or an owner/admin of the org the submission is routed to. Writes
-- go through service-role API routes only.
create policy intake_submission_events_select on public.intake_submission_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.intake_submissions s
      where s.id = intake_submission_events.submission_id
        and (
          s.submitted_by = (select auth.uid())
          or (
            s.review_route = 'owner'
            and s.review_org_id is not null
            and exists (
              select 1
              from public.org_members m
              where m.org_id = s.review_org_id
                and m.user_id = (select auth.uid())
                and m.role in ('owner', 'admin')
            )
          )
        )
    )
  );
