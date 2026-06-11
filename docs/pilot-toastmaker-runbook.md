# Pilot Toastmaker Runbook

**What it is:** each venue's top traffic-bringer ("Toastmaker") for the quarter —
scored by the system, **ratified by the GM** ("my board, my blessing").

## How it works

- **Scoring accrues automatically** in the `public.toastmaker_scores` view (rolling
  90 days, per venue × candidate): `score = attributed_redemptions×3 + own_checkins×1`;
  a candidate is **eligible** when `own_checkins ≥ 6 AND attributed_first_visits ≥ 3`.
  "Attributed" = the first check-in / a redemption by someone the candidate **referred**
  (`user_referrals`, captured from `?ref` share/QR links and claimed friend invites).
- **Console (normal path):** on the venue page (`orgs/[orgId]/venues/[venueId]`), the
  **Toastmaker** tab shows the top eligible nominee with **Approve** / **Pass**. Approve
  calls `ratify_toastmaker(venue_id, user_id)` → writes `public.venue_toastmakers` for the
  current quarter. One Toastmaker per (venue, quarter); approving again replaces it.
- **Display:** the ratified Toastmaker shows on the app venue screen, the public directory
  venue page, the profile badge (🥂 raised-glass variant), and the daily digest email.

## Hand-picking the first Toastmaker (pilot shortcut)

Early in the pilot a venue may not yet clear the eligibility floor, but you still want to
crown a launch Toastmaker with the GM's blessing. Two ways:

**A. GM does it in the console (preferred).** If there's an eligible nominee, the GM clicks
**Approve**. (Requires the GM to be an `owner`/`manager` of the venue's org — `ratify_toastmaker`
is org-gated on the caller.)

**B. Admin hand-pick via SQL (when there's no eligible nominee yet).** `ratify_toastmaker`
can't be used from a service-role/SQL session — it derives `ratified_by` from `auth.uid()`
and rejects non-org-members (`auth.uid()` is null for service-role). Insert the honor row
directly instead:

```sql
insert into public.venue_toastmakers (venue_id, user_id, quarter, ratified_by)
values (
  '<venue_id>',
  '<user_id>',                                              -- the chosen Toastmaker
  to_char(now(),'YYYY') || '-Q' || extract(quarter from now())::int,
  '<gm_or_admin_user_id>'                                   -- who blessed it
)
on conflict (venue_id, quarter) do update
  set user_id = excluded.user_id,
      ratified_by = excluded.ratified_by,
      created_at = now();
```

`toastmaker_scores` keeps accruing underneath; at the first quarterly review the console
nominee card takes over and the GM ratifies the system's pick.

## Cadence

Scoring is continuous; **ratification is quarterly and manual** (the title holds the
calendar quarter, `YYYY-Q#`). Re-ratify each quarter from the console.
