# Stage 5 + 6 Parity Notes

## Implemented in this stage

### Stage 5 (read-only core)
- Home discovery list with today-only filtering.
- Search screen with query-based filtering across venue/org/address/city.
- Venue detail screen with:
  - venue metadata
  - offer list
  - menu navigation
  - save/remove favorite action
- Menu screen with sections/items display.
- Supabase-backed `HappyHourService` now fetches:
  - published windows
  - published offers
  - referenced venues
  - menus / menu_sections / menu_items

### Stage 6 (stateful user features)
- Favorites screen tabs:
  - saved venues
  - history
  - itineraries
- Activity screen tabs:
  - followers
  - venue updates based on followed venues
- Add/Create screen:
  - venue suggestion
  - create itinerary
- Profile screen:
  - load/save profile
  - load/save preferences
  - sign out
- Supabase-backed `UserService` now supports:
  - followed venues fetch/toggle
  - profile fetch/upsert
  - preferences fetch/upsert
  - history fetch
  - lists fetch/create
  - venue suggestion insert
  - followers fetch

## Intentional deferrals
- Map parity was implemented in Stage 7 and validated in parity audit.
- Push notification feed deep-link parity remains Stage 7.
- Fine-grained style/pixel parity intentionally deferred; behavior parity prioritized.

## Known schema assumptions to verify
- Tables expected:
  - `happy_hour_windows`, `happy_hour_offers`, `venues`
  - `menus`, `menu_sections`, `menu_items`
  - `user_followed_venues`, `user_profiles`, `user_preferences`
  - `user_events`, `user_lists`, `user_follows`
- If your Supabase schema differs (especially menus), adjust table names/columns in `HappyHourService`.

