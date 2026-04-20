import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import UserBar from '@/components/layout/UserBar';
import { changePassword } from '@/actions/password-actions';

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect('/login');
  }

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
    <>
      <UserBar />
      <main className="min-h-[calc(100vh-3.5rem)] flex items-start justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div className="text-center mb-2">
            <h1 className="text-heading-lg font-bold text-foreground">Change password</h1>
            <p className="text-body-sm text-muted mt-2">
              Enter a new password for {auth.user.email}.
            </p>
          </div>

          {success ? (
            <div className="rounded-md border border-brand bg-brand/5 px-4 py-3">
              <p className="text-body-sm font-medium text-brand">Password updated successfully.</p>
              <p className="text-body-sm text-muted mt-1">
                Your new password is now active.{' '}
                <a href="/dashboard" className="text-brand underline underline-offset-4">
                  Back to dashboard
                </a>
              </p>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-md border border-error bg-error-light px-4 py-3">
              <p className="text-body-sm font-medium text-error">{errorMessage}</p>
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <form className="flex flex-col gap-4" action={changePassword}>
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

          <div className="text-center">
            <a
              href="/dashboard"
              className="text-caption text-muted hover:text-foreground underline underline-offset-4 transition-colors"
            >
              &larr; Back to dashboard
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
