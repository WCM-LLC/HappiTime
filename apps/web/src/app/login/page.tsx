import OAuthButtons from '@/components/OAuthButtons';
import { login, signup } from '../../actions/login-actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const error = sp?.error;
  const next = sp?.next ?? '';
  const isAdminLogin = next === '/admin';

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* Logo / Brand Header */}
        <div className="flex flex-col items-center mb-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 439 148"
            className="h-12"
            aria-label="HappiTime"
            role="img"
          >
            <circle cx="260.2" cy="74.0" r="47.9" fill="#C8965A" />
            <text
              x="30"
              y="93.0"
              fontFamily="var(--font-display), 'Plus Jakarta Sans', sans-serif"
              fontWeight="800"
              fontSize="72"
              letterSpacing="-0.02em"
            >
              <tspan fill="#1A1A1A">Happ</tspan>
              <tspan fill="#ffffff">iTi</tspan>
              <tspan fill="#1A1A1A">me</tspan>
            </text>
          </svg>
          <p className="text-body-sm text-muted mt-2">
            {isAdminLogin
              ? 'Sign in with your admin account to continue.'
              : 'The venue management platform for Happy Hour marketing.'}
          </p>
        </div>

        {/* Error Banner */}
        {error ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3">
            <p className="text-body-sm font-medium text-error">Login error</p>
            <p className="text-body-sm text-error/80 mt-0.5">
              {error === 'bad_credentials'
                ? 'Incorrect email or password. Try again, or sign up below.'
                : error === 'not_admin'
                  ? 'That account does not have admin access.'
                  : 'Something went wrong. Try again or use a social login.'}
            </p>
          </div>
        ) : null}

        {/* Social Login Card */}
        {!isAdminLogin ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h3 className="text-heading-sm font-semibold text-foreground mb-4">Social login</h3>
            <OAuthButtons />
          </div>
        ) : null}

        {/* Email + Password Card */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h3 className="text-heading-sm font-semibold text-foreground mb-4">
            {isAdminLogin ? 'Admin login' : 'Email + password'}
          </h3>
          <form className="flex flex-col gap-4">
            {next ? <input type="hidden" name="next" value={next} /> : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-body-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={isAdminLogin ? 'admin@happitime.biz' : ''}
                placeholder="you@example.com"
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-body-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="current-password"
                placeholder="Min. 8 characters"
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
              />
            </div>

            <div className="flex items-center justify-end">
              <a
                href="/forgot-password"
                className="text-caption text-muted hover:text-brand underline underline-offset-4 transition-colors"
              >
                Forgot password?
              </a>
            </div>

            <div className="flex gap-3 mt-1">
              <button
                formAction={login}
                className="flex-1 inline-flex items-center justify-center h-10 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors cursor-pointer"
              >
                Log in
              </button>
              {!isAdminLogin ? (
                <button
                  formAction={signup}
                  className="flex-1 inline-flex items-center justify-center h-10 px-4 rounded-md border border-border bg-surface text-foreground text-body-sm font-medium hover:bg-background transition-colors cursor-pointer"
                >
                  Sign up
                </button>
              ) : null}
            </div>
          </form>
        </div>

        {/* Contact info */}
        <p className="text-center text-caption text-muted">
          Need help getting set up? Contact support at{" "}
          <a
            href="https://happitime.biz/contactus"
            className="text-brand hover:text-brand-dark underline underline-offset-4 transition-colors"
            target="_blank"
            rel="noreferrer"
          >
            happitime.biz/contactus
          </a>
        </p>

        {/* Admin link / Back link */}
        <div className="text-center">
          {!isAdminLogin ? (
            <a
              href="/login?next=/admin"
              className="text-caption text-muted hover:text-foreground underline underline-offset-4 transition-colors"
            >
              Admin access
            </a>
          ) : (
            <a
              href="/login"
              className="text-caption text-muted hover:text-foreground underline underline-offset-4 transition-colors"
            >
              &larr; Back to regular login
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
