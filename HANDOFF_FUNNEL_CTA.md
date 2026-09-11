# Funnel: get directory visitors to the app (post-auth-outage growth work)

Context: the email-auth outage is fixed (see HANDOFF_AUTH_EMAIL_OUTAGE.md — completed). Next bottleneck, from the 2026-07-16 funnel audit: **only ~17 of ~250 daily requests reach `/app/`**. The directory gets real traffic on `/`, `/kc/`, and venue pages, but the app pitch lives on one page most visitors never see. This work is all in `apps/directory` (Next.js, deployed as `happitime-directory` on Vercel, domain happitime.biz).

## Goal
Every meaningful directory page should offer a low-friction path to install the app, without wrecking the browsing experience or SEO.

## Tasks

### 1. iOS Smart App Banner (one-liner, do first)
Add to the directory's root layout `<head>`:
```html
<meta name="apple-itunes-app" content="app-id=6757933269">
```
Safari on iOS renders a native install banner site-wide. Zero design work, zero CLS penalty.

### 2. Sticky mobile app CTA on venue + neighborhood pages
- On `/kc/**` venue detail and neighborhood pages, mobile viewports only: a slim, dismissible bottom bar — "See tonight's happy hours in the app → Get HappiTime".
- Links: detect platform → App Store (`https://apps.apple.com/us/app/happitime/id6757933269`) / Play (`https://play.google.com/store/apps/details?id=com.jwill7486.happitime.mobile`); unknown → `/app/`.
- Dismiss persists for the session (in-memory or cookie — check what the codebase already uses; do not add a heavy consent surface).
- Must not cover map controls or the footer contact links; respect safe-area insets.

### 3. Inline app module on venue pages
On venue detail pages, below the happy-hour schedule block: a small card — "Want this in your pocket? Deal alerts + tonight's specials across {neighborhood}." with the two store badges. Desktop shows the QR (a QR generator already exists in `scripts/generate-venue-qrs.mjs` — reuse the approach, target the `/app/` URL with UTM).

### 4. UTM discipline
All store/app links added here get `?utm_source=directory&utm_medium={banner|sticky|inline}&utm_campaign=app-funnel` (on the `/app/` fallback links; store URLs use their own referrer params where supported). Keep consistent with the existing UTM convention used in social captions (`utm_source=tiktok&utm_campaign=tonight-MMDD`).

### 5. Measure it
`/app/` page + store-link clicks should be observable. GTM is already wired via `NEXT_PUBLIC_GTM_ID` (see ENV.md) — push a dataLayer event on CTA click (`app_cta_click` with `{placement, platform}`). If GTM isn't configured in prod, note that in your summary rather than adding a new analytics dependency.

## Constraints
- No layout shift on page load (SEO/CWV) — banner/sticky must not push content.
- Don't touch `apps/web` (console) or `apps/mobile`.
- Keep the coming-soon flag behavior (`NEXT_PUBLIC_COMING_SOON`) intact.
- Match existing directory styles/components; no new UI libraries.

## Done means
Smart App Banner live; sticky CTA on venue/neighborhood mobile pages with dismiss; inline module with store badges + desktop QR on venue pages; UTM + GTM events wired; `npm run lint` and the directory build pass; a before/after note on how a visitor on a venue page now reaches a store listing in ≤1 tap.
