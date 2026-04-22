# Stage 9 — Production Safety Review

## Scope Reviewed
- Auth/session lifecycle
- Backend mapping and Supabase read/write safety
- Loading/error resilience
- Platform permissions and URL handling
- Feature parity gaps and deploy blockers

## Review Findings

### 1) Auth / Session Restoration
- ✅ Session restore and refresh implemented.
- ✅ Deep-link callback handling implemented.
- ✅ Sign-out clears local state and attempts remote logout.
- ⚠️ OAuth provider setup is external and must be validated in a real app ID environment.

### 2) Supabase Mapping Integrity
- ✅ Services use explicit table/column mapping with Codable DTOs.
- ✅ User-scoped writes use access token Authorization header.
- ⚠️ Menu schema assumptions (`menus`, `menu_sections`, `menu_items`) must match production schema.
- ⚠️ If RLS policies differ from RN expectations, some user writes may fail and surface errors.

### 3) Loading / Error Handling
- ✅ All core view models expose loading + error state.
- ✅ No silent fatal paths; errors are surfaced in UI.
- ⚠️ Retry UX can be expanded (currently basic retry controls).

### 4) Permissions / Platform Services
- ✅ Location permission flow integrated for map screen.
- ✅ External links implemented (website, call, Apple Maps).
- ✅ Auth callback URL handling integrated at app root.
- ⚠️ Push notification response routing parity is not yet fully implemented.

### 5) iPhone / iPad Adaptation
- ✅ Current SwiftUI screens are functional on both size classes.
- ⚠️ iPad-optimized split layouts and denser multitasking treatments are pending enhancement.

## Required External Config Checklist (Pre-Production)
- [ ] `SUPABASE_URL` in Info.plist
- [ ] `SUPABASE_ANON_KEY` in Info.plist
- [ ] `AUTH_REDIRECT_SCHEME` in Info.plist + URL types
- [ ] Supabase Auth redirect URL matches app scheme callback
- [ ] Apple Sign-In capability enabled (if Apple OAuth enabled)
- [ ] Google iOS client configured + reversed URL scheme
- [ ] Location usage description keys present

## Release Readiness Verdict
- **Current status:** `Partial / Needs external config + schema verification`
- **Blockers to fully production-ready:**
  1. Validate OAuth provider config in real iOS app environment.
  2. Confirm Supabase menu schema and RLS parity with existing RN app.
  3. Complete push response navigation parity if required for release parity criteria.

