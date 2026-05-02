# Production Readiness Review (2026-05-02)

## Scope & Method
- Reviewed monorepo structure, key runtime apps (`apps/web`, `apps/directory`, `apps/mobile`), Supabase migrations/functions, and root/build configuration.
- Ran test suite and pattern-based security scans.
- Findings are marked **Verified**, **Likely**, or **Needs confirmation**.

## Top Findings
1. **Missing CSRF defenses on state-changing authenticated POST routes** (**High**, Verified)
2. **User-controlled `Origin` header is used to build Stripe redirect URLs** (**High**, Verified)
3. **No rate limiting / abuse controls on public contact endpoint with file attachments** (**Medium**, Verified)
4. **`npm audit` could not run due to upstream 403, so dependency CVE posture is unverified** (**Medium**, Verified limitation)
5. **Edge middleware matcher applies auth checks broadly and may include non-app endpoints unnecessarily** (**Low**, Likely)

## Evidence Summary
- `apps/web/src/app/api/stripe/checkout/route.ts` and `portal/route.ts` use `req.headers.get('origin')` to construct callback URLs.
- `apps/web/src/app/api/*` and directory `api/contact` accept authenticated/public POST actions with no explicit CSRF token/origin checks.
- `apps/directory/src/app/api/contact/route.ts` validates content, but has no rate limit, bot control, or anti-automation controls.
- Root tests run and pass partially, but many smoke tests are skipped due missing env/server.

## Recommended First Remediations
1. Replace `origin` header trust with allowlisted canonical app URL env var for Stripe flows.
2. Add CSRF protection strategy for authenticated route handlers and server actions (token or strict origin+same-site policy checks).
3. Add rate limiting (IP + burst) and CAPTCHA or equivalent bot defense for `/api/contact`.
4. Establish a reliable dependency scanning path in CI (e.g., OSV-Scanner/Snyk/GitHub Advisory DB) if npm audit remains blocked.
5. Expand CI integration tests with seeded Supabase and auth fixtures so critical smoke tests do not skip.
