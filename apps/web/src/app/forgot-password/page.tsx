import { requestPasswordReset } from '@/actions/password-actions';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const error = sp?.error;
  const sent = sp?.sent === 'true';

  const errorMessage =
    error === 'missing_email'
      ? 'Please enter your email address.'
      : error
        ? error
        : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex flex-col items-center mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 439 148" className="h-12" aria-label="HappiTime" role="img">
            <circle cx="260.2" cy="74.0" r="47.9" fill="#C8965A" />
            <text x="30" y="93.0" fontFamily="var(--font-display), 'Plus Jakarta Sans', sans-serif" fontWeight="800" fontSize="72" letterSpacing="-0.02em">
              <tspan fill="#1A1A1A">Happ</tspan><tspan fill="#ffffff">iTi</tspan><tspan fill="#1A1A1A">me</tspan>
            </text>
          </svg>
          <p className="text-body-sm text-muted mt-2">
            Reset your password
          </p>
        </div>

        {sent ? (
          <div className="rounded-md border border-brand bg-brand/5 px-4 py-3">
            <p className="text-body-sm font-medium text-brand">Check your email</p>
            <p className="text-body-sm text-muted mt-1">
              If an account exists with that email, we&apos;ve sent a password reset link.
              Check your inbox and spam folder.
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3">
            <p className="text-body-sm font-medium text-error">{errorMessage}</p>
          </div>
        ) : null}

        {!sent ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <p className="text-body-sm text-muted mb-4">
              Enter the email address associated with your account and we&apos;ll send you a link to
              reset your password.
            </p>
            <form className="flex flex-col gap-4" action={requestPasswordReset}>
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
                  placeholder="you@example.com"
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors cursor-pointer"
              >
                Send reset link
              </button>
            </form>
          </div>
        ) : null}

        <div className="text-center">
          <a
            href="/login"
            className="text-caption text-muted hover:text-foreground underline underline-offset-4 transition-colors"
          >
            &larr; Back to login
          </a>
        </div>
      </div>
    </main>
  );
}
