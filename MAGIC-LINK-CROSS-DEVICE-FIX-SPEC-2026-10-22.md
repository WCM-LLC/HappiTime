# Super User magic link fails outside the requesting browser — FIX SPEC (2026-10-22)

**Owner:** Builder · **Priority:** P1 (blocks Tastemaker onboarding) · **Size:** ~half day incl. test · **Status:** fix A SHIPPED 2026-10-22 17:4x UTC (console verified: `POST /verify` 200, `login_method=otp`, 17:44:15Z); mobile post-change regression pending; B/C open
**Reported:** J, 2026-10-22 12:15 CT. Account: `juan_a_williams@icloud.com` (`7a01495d…`, role `super_user`, handle `jwill86`).

## Symptom

Request a magic link from `/super-user/login`, click it, land on `/auth/auth-code-error`
("We couldn't finish signing you in"). The link is consumed, so a second click says it's expired.

## Evidence (Supabase auth logs, 2026-10-22 UTC)

| Time | Event | Result |
|---|---|---|
| 17:14:21 | `POST /otp` for `7a01495d`, `redirect_to=https://console.happitime.biz/auth/callback?next=%2Fdashboard%2Fguides%2Fnew` | 200 — link sent |
| 17:14:37 | `GET /verify` from J's IP, same redirect target | 303 — token consumed, audit `login` written |
| after | `POST /token?grant_type=pkce` | **never happened** |

No `/token` call after a successful `/verify` means the callback route never reached Supabase.
`@supabase/auth-js 2.103.3` `_exchangeCodeForSession` throws `AuthPKCECodeVerifierMissingError`
**before any network call** when the `sb-…-auth-token-code-verifier` cookie is absent
(`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:1449`). The route then redirects to
`/auth/auth-code-error`, and `auth-error-copy.mjs` classifies it as `session_mismatch`.

Role gate ruled out: `user_profiles.role = 'super_user'` for this user. Redirect allowlist ruled out:
GoTrue honored `console.happitime.biz` as `redirect_to` (it would have fallen back to Site URL otherwise).

## Root cause

`sendSuperUserMagicLink` (`apps/web/src/actions/login-actions.ts`) uses the `@supabase/ssr` server
client, which defaults to **PKCE** for `signInWithOtp`. PKCE binds the link to a cookie on the exact
origin that requested it. Two ways that cookie goes missing — both happened or can happen here:

1. **Host mismatch.** `resolveConsoleOrigin()` (`apps/web/src/utils/auth-redirects.ts`) prefers
   `NEXT_PUBLIC_CONSOLE_URL` over the request host. The console answers on both
   `console.happitime.biz` and `happitime-console.vercel.app`. Request the link on one host, the
   email points at the other, cookie is unreadable. J's OAuth attempts 25 min earlier came from the
   vercel.app host. This is the same bug class fixed for OAuth in `auth/callback/route.ts` (see its
   header comment) — the magic-link send path still has it.
2. **Device mismatch.** Email opened on a phone, link requested on a laptop. PKCE magic links can
   *never* work this way. This is the default Tastemaker behavior.

## Fix (do both)

### A. Make the console magic link cookie-independent — `token_hash` flow, mobile untouched

The console callback already supports it (`route.ts` → `verifyOtp({ type, token_hash })`), which
verifies server-to-server with no browser state. Only the email template needs to change.

**Constraint (verified 2026-10-22):** the Magic Link template is shared with the mobile app.
`apps/mobile/src/hooks/useMagicLinkListener.ts` handles `?code=` and `#access_token=…&refresh_token=…`
only — there is no `token_hash` branch. A blanket switch to `token_hash` breaks iOS/Android sign-in
(confirmed working today, implicit flow) until a store release ships. So branch in the template on the
requesting client. Mobile's redirect is exactly `happitime://auth/callback`
(`Linking.createURL("auth/callback", { scheme: "happitime" })`, matches the 17:11 UTC log).

Supabase Dashboard → Authentication → Email Templates → **Magic Link**. Replace the
`{{ .ConfirmationURL }}` href with:

```
{{ if eq .RedirectTo "happitime://auth/callback" }}{{ .ConfirmationURL }}{{ else }}{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=magiclink{{ end }}
```

- Mobile keeps the exact link it gets today (implicit `/verify` → `#access_token`).
- Every web client gets `…/auth/callback?next=…&token_hash=…&type=magiclink`. `{{ .RedirectTo }}`
  already carries `?next=…`, hence `&` not `?`. Keep the rest of the template.
- If the mobile `redirectTo` ever gains a query string the `eq` stops matching and mobile silently
  falls to the web branch — add a `token_hash` branch to `useMagicLinkListener`
  (`supabase.auth.verifyOtp({ token_hash, type: "magiclink" })`) in the next app release so the
  conditional can be removed later.

Do **not** touch the Recovery template — `auth/recovery/page.tsx` has its own handling. **Confirm
signup** and **Invite** use `{{ .ConfirmationURL }}` and have the same cross-device fragility; convert
only if those flows route through `/auth/callback`, otherwise leave and note in the PR.

### B. Send the link from the host the person is actually on

In `sendSuperUserMagicLink`, build `callbackUrl` from the **request origin** (headers) first, and fall
back to env only when the request host is a marketing host or absent — i.e. invert the precedence in
`resolveConsoleOrigin`, or add a `resolveRequestOrigin(h)` used only by the magic-link and OAuth send
paths. After fix A this is belt-and-braces (the token_hash flow doesn't need the cookie), but it keeps
the session cookie landing on the host the user is browsing, which is what the callback comment already
promises.

### C. Stop the drift: pick one console host

`happitime-console.vercel.app` should 308 → `console.happitime.biz` (Vercel project → Domains →
set redirect). Every auth bug in this area has been a two-host bug. Confirm the Supabase redirect
allowlist still includes both during the transition, then drop the vercel.app entry.

## Acceptance

- [ ] Request link on Mac Chrome at `console.happitime.biz`, open on iPhone Mail → lands on
      `/dashboard/guides/new` signed in as the super user.
- [ ] Request link at `happitime-console.vercel.app`, open on same browser → signed in (A or C makes this pass).
- [ ] **Mobile regression:** request a magic link from the iOS and Android apps, open on the same phone →
      signed in. Email link must still be the `/verify?token=…&redirect_to=happitime://auth/callback` form.
- [ ] Auth logs show `POST /verify` (token_hash) with `action=login`, no `/auth-code-error` redirect.
- [ ] Password recovery still works end-to-end (template untouched, regression check only).
- [ ] `node --test test/auth-error-copy.test.mjs` still passes.
- [ ] `ENV.md` updated: `NEXT_PUBLIC_CONSOLE_URL` is the fallback, not the authority, for auth redirects.

## Known residual risk — mail link scanners

17:36:24Z: a Google IP (172.253.192.119) re-fetched the jugganaught@gmail.com magic link 9s after the
real tap → `403 One-time token not found`. Gmail/Outlook link scanners can consume a one-click link
before the person taps it; `token_hash` on a GET callback is as exposed as `ConfirmationURL`. If
Tastemakers report "expired and I never clicked it," this is why. Mitigation when it matters: offer
the 6-digit `{{ .Token }}` OTP code alongside the link and accept it on `/super-user/login`
(`verifyOtp({ email, token, type: 'email' })`). Not in scope for this ticket.

## Out of scope

Mobile app magic link (`happitime://auth/callback`) — implicit flow, working (`mikitaburton@yahoo.com`
17:11 UTC same day). Leave it.

## Workaround until shipped

Use **Sign in with Apple** on `/super-user/login` (same account; worked 16:50 UTC), or request the
link at `console.happitime.biz` and open it in that same browser.
