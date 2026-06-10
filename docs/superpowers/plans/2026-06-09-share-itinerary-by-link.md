# Share Itinerary by Link — Implementation Plan

Design: `docs/superpowers/specs/2026-06-09-share-itinerary-by-link-design.md`

## Phase 1 — web viewer + share URL (this PR; OTA + Vercel, no build) ✅
1. **Migration `20260609200000_get_shared_itinerary_by_token.sql`** — `get_shared_itinerary(p_token)`
   (anon read by token) + `ensure_share_token(p_list_id)` (owner-checked token mint).
   Verified against prod via ROLLBACK dry-runs.
2. **`apps/directory/src/app/i/[token]/page.tsx`** — server viewer via the RPC, OG/Twitter
   meta, store CTAs, `notFound()` on miss.
3. **`apps/mobile/.../FavoritesScreen.tsx#handleShareOutside`** — `ensure_share_token` →
   `https://happitime.biz/i/<token>` in the share message; store-only fallback on error.

**Ship Phase 1:** merge (auto-deploys migration + Vercel directory) → OTA `eas update
--branch master` for the mobile share-message change → verify the web URL renders.

## Phase 2 — native open — CODE BUILT (PR pending build to ship)
Apple Team ID `787CJ7NZ7H` provided 2026-06-09. Implemented:
1. ✅ **`apps/directory/public/.well-known/apple-app-site-association`** (appID
   `787CJ7NZ7H.com.jwill7486.happitime.mobile`, paths `/i/*`, new + legacy formats) +
   `next.config.ts` `headers()` sets `Content-Type: application/json`. Ships on Vercel merge.
2. ✅ **`apps/mobile/app.json`**: `ios.associatedDomains: ["applinks:happitime.biz"]` +
   Android `intentFilters` autoVerify for `https://happitime.biz/i/*`. **Native config →
   requires a new build (NOT OTA).**
3. ✅ **`useItineraryDeepLink(navigationRef)`** (wired in AppNavigator next to
   useVenueDeepLink) + `parseItineraryLink.mjs` (uuid-validated; +tests in
   `test/parse-itinerary-link.test.mjs`) → routes `https://happitime.biz/i/<token>` and
   `happitime://itinerary?token=` to a new read-only **`SharedItineraryScreen`** that renders
   via `get_shared_itinerary` (bypasses RLS → works for private lists too).
4. ⏳ **STILL OPEN — Android `assetlinks.json`**: needs the release keystore SHA-256
   (`eas credentials` / Play Console). iOS (the reported 2-iPhone bug) is complete; Android
   App Links won't auto-verify until this is served.
5. ⏳ **Build + device test (HARD GATE):** same EAS build as the Apple nonce. On a real
   iPhone with the app installed, tapping a shared SMS link opens the app **to the
   itinerary**; also run the Apple-login test. Do not release without both. Do NOT OTA the
   app.json change — it only takes effect in a build.

## Notes
- Token-possession is the access grant (works for private lists too).
- Regenerate `supabase/types/generated.ts` after deploy to drop the `(supabase as any)` cast
  on the `ensure_share_token` call.
