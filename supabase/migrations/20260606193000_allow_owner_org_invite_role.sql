-- Allow inviting an organization OWNER.
--
-- The web app (apps/web/src/actions/access-actions.ts → INVITE_ROLE_VALUES)
-- has long offered owner/manager/host as invitable roles, but the org_invites
-- CHECK constraint only permitted manager/host. So any "invite as owner" passed
-- the app-level validation and then failed the org_invites INSERT with a 400
-- (check_violation) — silently surfacing as "invite failed" in the UI.
--
-- Expand the constraint to match the app's invite roles. Widening the allowed
-- set cannot violate existing rows, so this is a safe, online change.
-- org_members already permits 'owner' (owners exist there), so accepting an
-- owner invite needs no further schema change.

alter table public.org_invites
  drop constraint if exists org_invites_role_check;

alter table public.org_invites
  add constraint org_invites_role_check
  check (role in ('owner', 'manager', 'host'));
