import OAuthButtons from '@/components/OAuthButtons';
import { Logo } from '@/components/ui/Logo';
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

  const inputCls =
    'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';

  return (
    <main className="min-h-screen flex bg-background">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex w-[380px] shrink-0 bg-dark flex-col justify-between p-12">
        <Logo height={26} variant="light" />

        <div>
          <h2 className="text-[1.75rem] font-extrabold text-white leading-[1.15] tracking-tight mb-4">
            {isAdminLogin
              ? 'Admin access for the HappiTime platform.'
              : 'Manage your happy hour listings in one place.'}
          </h2>
          <p className="text-body-sm text-muted-light leading-relaxed">
            {isAdminLogin
              ? 'Sign in with your admin credentials to access the console.'
              : 'Update hours, menus, and deals. See how customers find your venue.'}
          </p>
        </div>

        {!isAdminLogin && (
          <div className="flex gap-6">
            {[
              { n: '2,400+', l: 'Venues listed' },
              { n: '18K+', l: 'Monthly users' },
              { n: 'KC-first', l: 'Local focus' },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-[1.125rem] font-extrabold text-brand leading-none">{s.n}</div>
                <div className="text-caption text-muted mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px] flex flex-col gap-6">
          {/* Mobile-only logo */}
          <div className="flex justify-center lg:hidden">
            <Logo height={32} />
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-heading-lg font-bold text-foreground tracking-tight">
              {isAdminLogin ? 'Admin login' : 'Sign in to your account'}
            </h1>
            <p className="text-body-sm text-muted mt-1">
              {isAdminLogin
                ? 'Enter your admin credentials to continue.'
                : 'Enter your credentials to continue.'}
            </p>
          </div>

          {/* Error banner */}
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

          {/* Email + Password form */}
          <form className="flex flex-col gap-4">
            {next ? <input type="hidden" name="next" value={next} /> : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-body-sm font-medium text-foreground">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={isAdminLogin ? 'admin@happitime.biz' : ''}
                placeholder="you@example.com"
                className={inputCls}
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
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-3 mt-1">
              <button
                formAction={login}
                className="inline-flex items-center justify-center h-11 px-4 w-full rounded-md bg-brand text-white text-body-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer"
              >
                Sign in
              </button>
              {!isAdminLogin ? (
                <button
                  formAction={signup}
                  className="inline-flex items-center justify-center h-10 px-4 w-full rounded-md border border-border bg-surface text-foreground text-body-sm font-medium hover:bg-background transition-colors cursor-pointer"
                >
                  Create account
                </button>
              ) : null}
            </div>
          </form>

          {/* Divider + OAuth */}
          {!isAdminLogin ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-caption text-muted-light">or continue with</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <OAuthButtons />
            </div>
          ) : null}

          {/* Footer links */}
          <div className="flex flex-col gap-3 text-center">
            <a
              href="/forgot-password"
              className="text-body-sm text-brand hover:text-brand-dark font-medium transition-colors"
            >
              Forgot password? Reset it
            </a>
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
      </div>
    </main>
  );
}
