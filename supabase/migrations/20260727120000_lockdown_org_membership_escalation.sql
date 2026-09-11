-- SECURITY: close a privilege-escalation path that let ANY authenticated user
-- become the OWNER of ANY organization.
--
-- Reported as "a super user reached the venue creation flow via Dashboard", but
-- the underlying hole was much wider than super users. RLS policies that are
-- PERMISSIVE are OR-ed together, and two of them combined into a takeover chain:
--
--   1. org_members_insert_self  WITH CHECK (user_id = auth.uid())
--      The check constrains WHICH USER the row names -- it never constrains
--      WHICH ORG the row joins. So any authenticated user could insert
--      {org_id: <any org at all>, user_id: self, role: 'owner'}.
--   2. organizations_select_public exposes the id of every org that has a
--      published venue, so a target org_id is trivially discoverable.
--   3. venues_insert_org_members / venues_update_org_members then hand that
--      brand-new "owner" full create/edit/delete over the org's venues.
--
-- Verified against production inside a rolled-back transaction: a non-member
-- account inserted itself as owner of a real customer org, renamed all 7 of that
-- org's published venues, and created a new published venue. Nothing in the app
-- had to cooperate -- this was reachable from any signed-in session.
--
-- The fix is an allowlist: org membership may only be granted BY an existing org
-- owner or a platform admin. It can never be self-granted. That closes the hole
-- for all 70 accounts rather than special-casing the one role that reported it.
--
-- Nothing legitimate depended on self-insert:
--   * createOrganization's insert of the creator's own membership is already
--     covered by org_members_insert_creator_or_owner (created_by = auth.uid()).
--   * Invite-accept and venue-claim run through createServiceClient(), and
--     service_role bypasses RLS entirely.

drop policy if exists "org_members_insert_self" on public.org_members;

-- Organization creation is an admin/invite/claim-driven onboarding step, not a
-- self-serve one. Of the six memberships in production: two were created by the
-- platform admin, one came through an accepted invite, and three were admin
-- attached to admin-created orgs (organizations.created_by IS NULL). No end user
-- has ever self-served an organization.
--
-- Leaving INSERT open to every authenticated user is precisely what put a live
-- "New organization" form -- and the venue creation flow behind it -- in front of
-- a super user. Platform admins retain INSERT via organizations_admin_all /
-- platform_admin_all, and the web app creates orgs with the service-role client.

drop policy if exists "org_insert_self" on public.organizations;
drop policy if exists "organizations_insert_authenticated" on public.organizations;

-- Fail the migration loudly if any self-grant INSERT policy survives, so this
-- cannot silently regress if an older policy is ever replayed on top.
do $$
declare
  offending text;
begin
  select string_agg(format('%I.%I', c.relname, p.polname), ', ')
    into offending
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('org_members', 'organizations')
    and p.polpermissive
    and p.polcmd in ('a', '*')
    and pg_get_expr(p.polwithcheck, p.polrelid) in (
      '(user_id = auth.uid())',
      '(created_by = auth.uid())'
    );

  if offending is not null then
    raise exception
      'self-grant INSERT policy still present after lockdown: %', offending;
  end if;
end
$$;
