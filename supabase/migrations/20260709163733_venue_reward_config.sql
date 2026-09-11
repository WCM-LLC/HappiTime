-- Redeemable Rounds: per-venue reward config.
-- reward_preset = which preset reward guests can redeem (one per venue).
-- reward_active = the "advertise this reward" toggle. Offer is live when
-- reward_preset is not null AND reward_active = true.
alter table public.venues
  add column if not exists reward_preset text
    check (reward_preset in ('house_draft','well_cocktail','five_off','free_appetizer')),
  add column if not exists reward_active boolean not null default false;

-- Owner/manager edits these via the cookie-session (authenticated) client from
-- the venue dashboard. If venues uses column-level UPDATE grants, authenticated
-- needs an explicit grant on the new columns (mirrors the user_profiles lockdown
-- trap). Harmless if venues already grants UPDATE table-wide.
grant update (reward_preset, reward_active) on public.venues to authenticated;
