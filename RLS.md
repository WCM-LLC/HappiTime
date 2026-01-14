# Row Level Security (RLS)

Policies are defined in `supabase/migrations/20260108071000_rls_core.sql`.

## Tenancy model
- Portal users are isolated by `organizations` membership (`org_members`).
- Venue-level access uses `venue_members` assignments.

Helper functions (security definer):
- `public.is_org_member(org_id)`
- `public.is_org_owner(org_id)`
- `public.is_org_manager(org_id)`
- `public.is_org_host(org_id)`
- `public.has_venue_assignment(venue_id)`

## Public reads (consumer app)
Public (`anon`) access is allowed only for published content:
- `venues`: `status = 'published'`
- `happy_hour_windows`: `status = 'published'` and venue is published
- `happy_hour_offers`: `status = 'published'` and venue is published
- `menus`: `status = 'published'` + `is_active = true` and venue is published
- `menu_sections` / `menu_items`: allowed only through published menus
- `happy_hour_window_menus`: allowed only for published windows/menus
- `venue_media`: `status = 'published'` and venue is published
- `happy_hour_places`: `status = 'verified'`

## Portal writes
Writes are restricted to `authenticated` users with the right role:
- Org-level writes require `owner` (some venue writes allow `manager` if assigned).
- Menu section/item writes allow `host` if assigned to the venue.

