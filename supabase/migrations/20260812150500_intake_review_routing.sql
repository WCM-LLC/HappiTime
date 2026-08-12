-- Intake review routing (Fix 4 addendum #2): approval no longer always goes
-- to an admin. Venue owners approve their own scans implicitly at commit time
-- (no submission row is written for them at all). A super user's scan is
-- routed to the venue's owning org when that org has someone who can act on
-- it; only ownerless venues fall through to the admin queue.
--
-- Append-only per docs/database-change-policy.md — 20260812000945 stays as
-- shipped and this migration forward-fixes it.

alter table public.intake_submissions
  add column if not exists review_route text not null default 'admin'
    check (review_route in ('owner', 'admin')),
  add column if not exists review_org_id uuid
    references public.organizations(id) on delete set null;

comment on column public.intake_submissions.review_route is
  'Who owns this approval: the venue''s org (owner) or HappiTime staff (admin).';
comment on column public.intake_submissions.review_org_id is
  'Org that owns the approval when review_route = owner; null for the admin queue.';

-- The owner queue reads by (org, pending); FK-indexed from birth like the
-- columns in the parent migration.
create index if not exists intake_submissions_review_org_idx
  on public.intake_submissions (review_org_id, status)
  where status = 'pending';

-- The org members who can ACT on a submission can read the queue. Note this is
-- narrower than the set who can scan: an editor may photograph a menu, but an
-- editor's own scan is what lands in this queue, so approving is owner/admin
-- only (INTAKE_APPROVE_ROLES in utils/intake-access.ts). Writes still go
-- through service-role server actions that re-check membership; this policy
-- only opens reads.
-- auth.uid() is wrapped in a scalar subselect per 20260811175113.
create policy intake_submissions_select_org_reviewers on public.intake_submissions
  for select to authenticated
  using (
    review_route = 'owner'
    and review_org_id is not null
    and exists (
      select 1
      from public.org_members m
      where m.org_id = intake_submissions.review_org_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  );
