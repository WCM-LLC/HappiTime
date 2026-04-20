import { resetPassword } from '@/actions/password-actions';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const error = sp?.error;
  const success = sp?.success === 'true';

  const errorMessage =
    error === 'too_short'
      ? 'Password must be at least 8 characters.'
      : error === 'mismatch'
        ? 'Passwords do not match.'
        : error
          ? error
          : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="text-center mb-2">
          <h1 className="text-display-lg font-bold text-foreground tracking-tight">
            Happi<span className="text-brand">Time</span>
          </h1>
          <p className="text-body-sm text-muted mt-2">
            Set your new password
          </p>
        </div>

        {success ? (
          <div className="rounded-md border border-brand bg-brand/5 px-4 py-3">
            <p className="text-body-sm font-medium text-brand">Password updated successfully.</p>
            <p className="text-body-sm text-muted mt-1">
              You can now{' '}
              <a href="/login" className="text-brand underline underline-offset-4">
                sign in
              </a>{' '}
              with your new password.
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-error bg-error-light px-4 py-3">
            <p className="text-body-sm font-medium text-error">{errorMessage}</p>
          </div>
        ) : null}

        {!success ? (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <form className="flex flex-col gap-4" action={resetPassword}>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new_password" className="text-body-sm font-medium text-foreground">
                  New password
                </label>
                <input
                  id="new_password"
                  name="new_password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirm_password" className="text-body-sm font-medium text-foreground">
                  Confirm new password
                </label>
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors cursor-pointer mt-1"
              >
                Update password
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
