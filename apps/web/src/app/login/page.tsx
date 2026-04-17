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
    <main className="container">
      <div className="col" style={{ gap: 18, maxWidth: 520 }}>
        <h1 style={{ marginBottom: 0, color: 'var(--brand)' }}>HappiTime</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {isAdminLogin
            ? 'Sign in with your admin account to continue.'
            : 'Manage venues, happy hour times, menus, pricing, and media.'}
        </p>

        {error ? (
          <div className="card error">
            <strong>Login error</strong>
            <div className="muted">
              {error === 'bad_credentials'
                ? 'Incorrect email or password. Try again, or sign up below.'
                : error === 'not_admin'
                  ? 'That account does not have admin access.'
                  : 'Try again or use a social login.'}
            </div>
          </div>
        ) : null}

        {!isAdminLogin ? (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Social login</h3>
            <OAuthButtons />
          </div>
        ) : null}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>
            {isAdminLogin ? 'Admin login' : 'Email + password'}
          </h3>
          <form className="col" style={{ gap: 10 }}>
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={isAdminLogin ? 'admin@happitime.biz' : ''}
              />
            </label>
            <label>
              Password
              <input name="password" type="password" minLength={8} required autoComplete="current-password" />
            </label>
            <div className="row">
              <button formAction={login}>Log in</button>
              {!isAdminLogin ? (
                <button className="secondary" formAction={signup}>Sign up</button>
              ) : null}
            </div>
          </form>
        </div>

        {/* Admin access entry point */}
        {!isAdminLogin ? (
          <div style={{ textAlign: 'center' }}>
            <a
              href="/login?next=/admin"
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Admin access
            </a>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <a
              href="/login"
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              ← Back to regular login
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
