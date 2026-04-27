# Auth + Admin Regression Checklist

Use this checklist after any auth, middleware, admin-route, or environment wiring change.

## Required environment assumptions

- `NEXT_PUBLIC_SUPABASE_URL` is set to the intended Supabase project.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key) is set for the same project.
- `SUPABASE_SERVICE_ROLE_KEY` is set for admin write actions.
- `ADMIN_EMAILS` is optional.  
  - If omitted, code falls back to `admin@happitime.biz`.
  - If set, include all intended admin emails (comma-separated, case-insensitive).
  - For production, prefer setting `ADMIN_EMAILS` explicitly.

## Authentication smoke checks

1. Regular user can log in and is redirected to `/dashboard`.
2. Failed password login shows `bad_credentials`.
3. Password reset email can be requested and reset link lands in-app.

## Admin access checks

1. `admin@happitime.biz` can log in and reach `/admin`.
2. A non-admin authenticated user is redirected from `/admin` to `/login?next=/admin&error=not_admin`.
3. Admin actions that require service role (e.g. publish toggles) succeed when `SUPABASE_SERVICE_ROLE_KEY` is configured.
4. From `/admin`, opening an org with `?from=admin` works for admin (service-role read path), even without org membership row.
5. Non-admin users cannot use `?from=admin` links to bypass org/venue authorization.

## Session and guard checks

1. After login, refresh `/admin` and confirm session persists.
2. Logged-out access to `/admin` redirects to `/login?next=/admin`.
3. Logged-in access to `/login` redirects to `/dashboard`.

## Data/config checks when admin access fails

1. Confirm auth user exists in Supabase Auth with email `admin@happitime.biz`.
2. Confirm login is hitting the same Supabase project as middleware/server client.
3. Confirm `ADMIN_EMAILS` value (if set) includes expected admin email.
4. Confirm no stale deployment envs are overriding expected values.
5. Confirm admin email normalization assumptions (trim/lowercase) still match login and guard code.
