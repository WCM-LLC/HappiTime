# Stage 1 Audit — `/apps/mobile` → SwiftUI Migration Baseline

## 1) App Entry / Bootstrapping
- Root entry is Expo `index.js` -> `registerRootComponent(App)`.
- `App.tsx` is the runtime bootstrap:
  - initializes magic-link listener (`useMagicLinkListener`),
  - configures push notification registration (`useConfigPushNotifications(session)`),
  - restores session via `supabase.auth.getSession()`,
  - subscribes to `supabase.auth.onAuthStateChange`,
  - gates UI: boot spinner → `AuthScreen` when signed out → `AppNavigator` when signed in.
- Supabase client comes from `src/api/supabaseClient.ts` via `createSupabaseClient` from shared package with persisted auth in `AsyncStorage`.
- Environment/config loading:
  - `app.config.js` reads `.env` / `.env.local` and injects `extra.supabaseUrl`, `extra.supabaseAnonKey`, optional maps config.
  - runtime lookup in `supabaseClient.ts` checks `EXPO_PUBLIC_*` env first, then Expo manifest extra.
- Shared constants/theme: `src/theme/*` + `constants/theme.ts` (legacy Expo template also exists in `components/` + `hooks/` root folders).

## 2) Navigation
- Active nav container is `src/navigation/AppNavigator.tsx` (used by `App.tsx`).
- Root stack:
  - `AppTabs` (hidden header)
  - `HappyHourDetail` (header shown)
  - `VenuePreview` (header shown)
- Main tabs currently include:
  - Home
  - Map
  - Favorites
  - Add
  - Activity
  - Profile
- Auth gate is outside navigator (in `App.tsx`), not inside stack.
- Notification deep-link navigation handled by `useNotificationNavigation`:
  - `type=happy_hour` -> `HappyHourDetail(windowId)`
  - `type=venue` -> `VenuePreview(venueId)`
  - `type=friend` -> `AppTabs(Activity)`
- There is an older/alternate navigation file (`src/navigation/index.tsx`) with slightly different tab setup; appears unused by current boot path.

## 3) Screen Inventory

### AuthScreen
- Path: `src/screens/AuthScreen.tsx`
- Purpose: unauthenticated entry; magic-link + OAuth sign-in.
- Inputs: local `email`, loading state, status message.
- Outputs/actions:
  - `supabase.auth.signInWithOtp({ email, options.emailRedirectTo })`
  - `supabase.auth.signInWithOAuth({ provider: google|apple, options.redirectTo })`
  - external links to Terms/Privacy.
- Dependencies: `expo-linking`, Supabase auth, theme tokens.
- Navigation entry: shown directly by `App.tsx` when no session.
- Exit: auth state change triggers app bootstrap to render `AppNavigator`.
- Backend data: Supabase auth only.
- Auth requirement: no session required.
- Major state/UI behavior: loading disables buttons, inline status/error feedback.

### HomeScreen
- Path: `src/screens/HomeScreen.tsx`
- Purpose: primary discovery feed for today’s happy hours + filters + map preview.
- Inputs: data from hooks (`useHappyHours`, `useUserLocation`, `useUserPreferences`, `useUserFollowedVenues`, `useVenueCovers`).
- Outputs/actions:
  - search text filtering,
  - cuisine and price filters,
  - city preference save (`savePreferences`),
  - follow/unfollow venue,
  - navigate to `HappyHourDetail` and `Map` tab.
- Dependencies: map rendering (`react-native-maps`), location, shared display/formatter utils.
- Navigation entry: Home tab.
- Exit: detail push + tab switch to map.
- Backend data:
  - published happy-hour windows,
  - user preferences,
  - followed venues,
  - venue media covers.
- Auth requirement: screen is only reachable after app-level auth gate.
- Major state/UI behavior: pull-to-refresh, empty/error/loading states, platform-specific city picker (iOS `Alert.prompt`, Android modal), distance sort with fallback to saved home coordinates.

### MapScreen
- Path: `src/screens/MapScreen.tsx`
- Purpose: map-centric discovery of mappable happy-hour venues.
- Inputs: happy hours, location, preferences, followed venues.
- Outputs/actions: filter/search, recenter map, save/follow toggle, navigate detail.
- Dependencies: `react-native-maps`, display formatter helpers.
- Navigation entry: Map tab (and Home CTA to map).
- Exit: detail navigation.
- Backend data: happy hours + follow state.
- Auth requirement: authenticated flow only.
- Major state/UI behavior: marker color denotes active-today windows, selected marker opens callout card.

### FavoritesScreen
- Path: `src/screens/FavoritesScreen.tsx`
- Purpose: user-specific saved venues, history, and itineraries (lists).
- Inputs: happy hours, followed venues, history entries, user lists, followers, location.
- Outputs/actions:
  - tab switch between Favorites / History / Itineraries,
  - open `HappyHourDetail`,
  - edit/delete/share itinerary,
  - update list metadata via modal.
- Dependencies: `useUserFollowedVenues`, `useUserHistory`, `useUserLists`, `useUserFollowers`, `useVenueCovers`, `Share` API.
- Navigation entry: Favorites tab.
- Exit: detail navigation.
- Backend data:
  - `user_followed_venues`,
  - `user_events` (history),
  - `user_lists`, `user_list_items`,
  - follower data for share targets.
- Auth requirement: effectively required for meaningful data.
- Major state/UI behavior: segmented tabs, empty states per tab, editable modal form for list operations.

### AddScreen
- Path: `src/screens/AddScreen.tsx`
- Purpose: creation flow for venue suggestions and new itineraries.
- Inputs: local form fields + current user.
- Outputs/actions:
  - create itinerary (`useUserLists.createList`),
  - submit venue suggestion (insert `user_events` with `event_type="venue_suggestion"`).
- Dependencies: Supabase, auth hook, user lists hook.
- Navigation entry: Add tab.
- Exit: in-screen mode transitions; returns to home mode after success.
- Backend data: `user_lists`, `user_events`.
- Auth requirement: checks user for create actions.
- Major state/UI behavior: multi-mode screen (`home|venue|list`), form validation, alerts on completion/errors.

### ActivityScreen
- Path: `src/screens/ActivityScreen.tsx`
- Purpose: social/activity feed for friends and venue updates.
- Inputs: followers, followed venues, happy-hour windows.
- Outputs/actions:
  - follow/unfollow back for follower rows,
  - navigate to `HappyHourDetail` from venue update rows.
- Dependencies: followers + followed venues + windows hooks.
- Navigation entry: Activity tab.
- Exit: detail navigation.
- Backend data:
  - `user_follows` (followers),
  - happy-hour windows filtered by followed venues.
- Auth requirement: authenticated flow.
- Major state/UI behavior: segmented feed (`friends|venues`), mock fallbacks present for empty/no-data cases.

### ProfileScreen
- Path: `src/screens/ProfileScreen.tsx`
- Purpose: account management, profile editing, preferences, and sign-out.
- Inputs: current user, profile, follow counts, followed venues, preferences.
- Outputs/actions:
  - save profile (`user_profiles` upsert),
  - save preferences (`user_preferences` upsert),
  - sign-out (`supabase.auth.signOut()`).
- Dependencies: multiple user hooks + Supabase auth.
- Navigation entry: Profile tab.
- Exit: sign-out returns to Auth gate via root app listener.
- Backend data: `user_profiles`, `user_preferences`, `user_follows`, `user_followed_venues`.
- Auth requirement: yes.
- Major state/UI behavior: toggle-heavy preference controls, explicit save actions and status messaging.

### HappyHourDetailScreen
- Path: `src/screens/HappyHourDetailScreen.tsx`
- Purpose: deep detail view for one happy-hour window and venue.
- Inputs: `route.params.windowId`, windows list, menus, follow state, lists, location, covers.
- Outputs/actions:
  - external website/phone/maps open,
  - save/unsave venue,
  - add venue to itinerary list.
- Dependencies: `useHappyHours`, `useVenueMenus`, `useUserFollowedVenues`, `useUserLists`, `useVenueCovers`, `useUserLocation`.
- Navigation entry: from Home/Favorites/Map/Activity/VenuePreview.
- Exit: back navigation.
- Backend data: happy-hour windows, menu hierarchy, user follow/list data.
- Auth requirement: in-auth flow.
- Major state/UI behavior: robust loading/error/not-found states, hero media, related windows, modal itinerary picker.

### VenuePreviewScreen
- Path: `src/screens/VenuePreviewScreen.tsx`
- Purpose: venue-centric listing of all windows for a selected venue.
- Inputs: `route.params.venueId`, happy-hour windows, covers.
- Outputs/actions: navigate to `HappyHourDetail(windowId)`.
- Dependencies: happy-hour + cover hooks.
- Navigation entry: notification deep link and potentially admin/preview paths.
- Exit: detail push.
- Backend data: same windows dataset filtered by venue.
- Auth requirement: in-auth flow.
- Major state/UI behavior: fallback empty messaging if no published windows.

## 4) State Management
- No Redux/MobX; state is hook-driven with local component state + custom data hooks.
- Session/user state sources:
  - app-level session in `App.tsx` (`getSession` + `onAuthStateChange`),
  - auxiliary hooks `useAuth`, `useCurrentUser` (duplicated pattern).
- Global-like state is implicit via hook subscriptions and Supabase-auth events.
- Caching behavior:
  - in-memory per-hook only,
  - no explicit normalized cache,
  - refetch patterns via hook `load/refresh` functions.
- Loading/empty/error handling:
  - explicit on major screens and hooks,
  - some silent failures remain (e.g., token persistence warnings only in dev).
- Derived state:
  - heavy use of `useMemo` for filters, sort, grouping, counts.
- Local persistence:
  - Supabase auth session persisted via `AsyncStorage` configured in Supabase client.

## 5) Data / Backend Layer
- Supabase client initialized through shared helper (`@happitime/shared-api/createSupabaseClient`) with RN auth storage.
- Shared API package (`@happitime/shared-api`) used for:
  - `fetchPublishedHappyHourWindows`,
  - `fetchVenueMenus`.
- Direct Supabase table usage in hooks/screens includes:
  - `venues`, `venue_media`,
  - `user_followed_venues`,
  - `user_preferences`,
  - `user_profiles`,
  - `user_lists`, `user_list_items`,
  - `user_follows`,
  - `user_events`,
  - `user_push_tokens`.
- Storage access:
  - cover images built manually using `${SUPABASE_URL}/storage/v1/object/public/venue-media/{storage_path}`.
- Location/geocoding:
  - only device location via `expo-location`; no server geocoding call in app code.
- Data transformation logic:
  - merges missing venues into windows,
  - computes org metadata and display names,
  - computes distance client-side,
  - formats DOW/time for UX.

## 6) Authentication
- Present methods:
  - email magic-link (`signInWithOtp`),
  - OAuth Google (`signInWithOAuth('google')`),
  - OAuth Apple (`signInWithOAuth('apple')`).
- Not present:
  - explicit email/password form flow.
- Session persistence:
  - enabled in Supabase client (`persistSession: true`) via `AsyncStorage`.
- Session restore:
  - `App.tsx` `getSession` at startup + auth state listener.
- Sign-out:
  - `supabase.auth.signOut()` from Profile.
- Auth callback/deep link:
  - app scheme `happitime`, redirect path `auth/callback`,
  - `useMagicLinkListener` parses fragment tokens and calls `supabase.auth.setSession`.

## 7) Platform Features
- Location permissions + GPS via `expo-location` (`requestForegroundPermissionsAsync`, `getCurrentPositionAsync`).
- Push notifications via `expo-notifications`:
  - registration, permission request, token acquisition,
  - token persistence to `user_push_tokens`,
  - response handling for navigation.
- External URL handling:
  - terms/privacy links,
  - venue website,
  - phone dialer,
  - Apple/Google maps deep links.
- Maps: `react-native-maps` map/marker UX in Home mini-map + full Map tab.
- Deep linking: `expo-linking` for auth callback and URL event listener.
- iPad/tablet support: Expo config says `ios.supportsTablet: true`.

## 8) Shared Business Logic
- Name selection and branding preferences: `getHappyHourDisplayNames`.
- Time/day formatting: `formatTimeRange`, `formatDays`.
- Relative freshness text: `timeAgo`.
- Distance math for sorting/labels: `distanceMiles`.
- Filtering/sorting rules (Home/Map/Favorites):
  - day-of-week inclusion,
  - search across venue/org/address fields,
  - cuisine + price tier filters,
  - distance-based sorting with null-last behavior.
- Timezone behavior:
  - time display is simple formatting of DB `start_time/end_time`; optional timezone text appended if present.
- Validation/business rules:
  - profile text normalization,
  - handle normalization lowercase,
  - itinerary/venue suggestion non-empty checks.

## 9) Dependencies + iOS Migration Strategies
- React/Expo stack in current app:
  - `expo`, `react-native`, `@react-navigation/*`, `react-native-maps`,
  - `@supabase/supabase-js`, `@react-native-async-storage/async-storage`,
  - `expo-linking`, `expo-location`, `expo-notifications`, `expo-device`, `expo-constants`.
- Shared internal packages:
  - `@happitime/shared-api`, `@happitime/shared-types`.
- Swift/iOS equivalents:
  - navigation: `NavigationStack`, `TabView`, sheet/fullScreenCover,
  - auth/session persistence: Supabase Swift SDK + Keychain/UserDefaults-backed persistence,
  - location: `CoreLocation`,
  - push: `UserNotifications` + APNs token handling,
  - deep links/auth callback: `onOpenURL`, URL schemes, Associated Domains if universal links used,
  - maps: `MapKit` (or Google Maps iOS SDK if parity requires).
- Shared API parity strategy:
  - reuse same Supabase schema and shared query semantics,
  - port model structures/types from `@happitime/shared-types` into Codable Swift models,
  - replicate transformation logic from JS hooks in Swift services/view models.

## Migration Risk Notes (Stage 1)
1. **Auth flow parity risk**: app uses magic-link + OAuth callback token parsing from URL fragment; Swift implementation must verify Supabase iOS SDK callback handling matches this behavior exactly.
2. **Duplicate auth abstractions** (`App.tsx` session + `useAuth`/`useCurrentUser`) indicate drift risk; native app should centralize source of truth.
3. **Data consistency risk**: some hooks use `any` casts and optional fields; Swift model strictness must tolerate nullable/partial rows without crashes.
4. **Platform config risk**: push notifications and OAuth require explicit iOS capabilities/entitlements that Expo currently abstracts.
5. **Navigation drift risk**: stale `src/navigation/index.tsx` suggests historical divergence; migration should follow `App.tsx` + `AppNavigator.tsx` as canonical runtime path.

## Stage 1 Scope Confirmation
- No React Native files modified.
- No shared package files modified.
- Audit-only output created under `/apps/ios_mobile` to keep migration isolated.
