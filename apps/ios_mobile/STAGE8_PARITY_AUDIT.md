# Stage 8 — Parity Audit (`/apps/mobile` vs `/apps/ios_mobile`)

| React Native Feature | SwiftUI Equivalent | Status | Risk | Notes |
|---|---|---|---|---|
| App boot + session restore | `HappiTimeApp` + `SessionStore.bootstrapSession()` | Done | Medium | Auth restore + refresh implemented via Supabase auth endpoints. |
| Auth gate (signed out vs app tabs) | `AppCoordinator` route switch | Done | Low | Mirrors RN auth gating behavior. |
| Magic link auth (email OTP) | `AuthView` + `SupabaseAuthService.signInWithMagicLink` | Done | Medium | Uses GoTrue `/auth/v1/otp`. |
| Google OAuth | `AuthView` + OAuth URL open | Done | Medium | Requires external provider config in Supabase + iOS URL schemes. |
| Apple OAuth | `AuthView` + OAuth URL open | Done | Medium | Requires Sign In with Apple capability. |
| Auth callback deep link | `.onOpenURL` -> `SessionStore.handleOpenURL` | Done | Medium | Parses fragment/query tokens and establishes session. |
| Home discovery (today windows) | `HomeView` + `HomeViewModel` | Done | Medium | Includes search/cuisine/price filters and detail nav. |
| Search flow | `SearchView` + `SearchViewModel` | Done | Low | Text-based filtering parity over venue/org/address/city. |
| Venue details | `VenueDetailView` + VM | Done | Medium | Includes offers, menus, save toggle, external actions. |
| Menu sections/items | `MenuView` + `HappyHourService.fetchVenueMenus` | Done | Medium | Depends on `menus/menu_sections/menu_items` schema parity. |
| Favorites tab (saved venues) | `FavoritesView` + VM | Done | Medium | Uses `user_followed_venues` + windows join. |
| History tab | `FavoritesView` History section | Done | Medium | Uses `user_events` filtered event types. |
| Itineraries tab | `FavoritesView` Lists section | Done | Medium | Read + display itinerary metadata. |
| Activity friends | `ActivityView` Friends tab | Done | Medium | Uses `user_follows` + profile join. |
| Activity venues | `ActivityView` Venues tab | Done | Medium | Uses followed venues + window updates. |
| Add: venue suggestion | `AddView` venue mode | Done | Medium | Writes `user_events` `venue_suggestion` metadata. |
| Add: new itinerary | `AddView` itinerary mode | Done | Medium | Creates `user_lists` records. |
| Profile read/save | `ProfileView` + VM | Done | Medium | `user_profiles` upsert/read. |
| Preferences read/save | `ProfileView` + VM | Done | Medium | `user_preferences` upsert/read. |
| Sign out | Profile sign out button | Done | Low | Calls `SessionStore.signOut()` and routes to auth. |
| Map tab markers/filtering | `MapScreenView` + `MapViewModel` | Done | Medium | MapKit map + cuisine/query filtering + marker detail nav. |
| Location permission prompt | `LocationService` used by map | Done | Medium | Requests When-In-Use and recenters map camera. |
| Push notification navigation | Partial | Partial | Medium | Auth deep links done; push response navigation not yet wired in SwiftUI. |
| iPad-specific layout refinements | Basic adaptive SwiftUI | Partial | Low | Functional on iPad, but split-view-specific layout refinements pending. |
| Pixel-perfect visual parity | Platform-native approximation | Intentionally platform-native difference | Low | Behavior parity prioritized per migration goals. |

