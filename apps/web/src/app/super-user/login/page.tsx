import { headers } from 'next/headers';
import OAuthButtons from '@/components/OAuthButtons';
import { Logo } from '@/components/ui/Logo';
import { sendSuperUserMagicLink } from '@/actions/login-actions';
import { GUIDE_AUTHORING_PATH, isGuideAuthoringPath, safeNextPath } from '@/utils/auth-paths';
import { resolveConsoleOrigin } from '@/utils/auth-redirects';

const NOTICE: Record<string, string> = {
  magic_link_sent: 'Magic link sent. Check your email to open guide authoring.',
};

const ERRORS: Record<string, string> = {
  bad_credentials: 'Use Apple, Google, or a magic link for Super User guide authoring.',
  magic_link_failed: 'Unable to send a magic link for that email.',
  not_authorized: 'That account is signed in, but it has not been approved for Super User guide authoring.',
  signup_failed: 'Super User access requires an approved HappiTime account.',
};

export default async function SuperUserLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const safeNext = safeNextPath(sp.next);
  const next = isGuideAuthoringPath(safeNext) ? safeNext! : GUIDE_AUTHORING_PATH;
  const noticeText = sp.notice ? (NOTICE[sp.notice] ?? null) : null;
  const errorText = sp.error ? (ERRORS[sp.error] ?? 'Something went wrong. Try again.') : null;
  const redirectOrigin = resolveConsoleOrigin(await headers());

  const inputCls =
    'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-foreground placeholder:text-muted-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand transition-colors';

  return (
    <main className="min-h-screen flex bg-background">
      <div className="hidden lg:flex w-[380px] shrink-0 bg-dark flex-col justify-between p-12">
        <div>
          <h2 className="text-[1.75rem] font-extrabold text-white leading-[1.15] tracking-tight mb-4">
            Guide authoring for HappiTime Super Users.
          </h2>
          <p className="text-body-sm text-muted-light leading-relaxed">
            Create featured guides, share picks, and submit content for review.
          </p>
        </div>
        <div />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px] flex flex-col gap-6">
          <div className="flex justify-center lg:justify-start">
            <Logo height={40} />
          </div>

          <div>
            <h1 className="text-heading-lg font-bold text-foreground tracking-tight">
              Super User login
            </h1>
            <p className="text-body-sm text-muted mt-1">
              Sign in with the same HappiTime account you use in the app.
            </p>
          </div>

          {noticeText ? (
            <div className="rounded-md border border-success bg-success-light px-4 py-3">
              <p className="text-body-sm font-medium text-success">{noticeText}</p>
            </div>
          ) : null}

          {errorText ? (
            <div className="rounded-md border border-error bg-error-light px-4 py-3">
              <p className="text-body-sm font-medium text-error">Login error</p>
              <p className="text-body-sm text-error/80 mt-0.5">{errorText}</p>
            </div>
          ) : null}

          <OAuthButtons next={next} providers={['apple', 'google']} redirectOrigin={redirectOrigin} />

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-caption text-muted-light">or email magic link</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form className="flex flex-col gap-4" action={sendSuperUserMagicLink}>
            <input type="hidden" name="next" value={next} />
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
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center h-11 px-4 w-full rounded-md bg-brand text-white text-body-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer"
            >
              Send magic link
            </button>
          </form>

          <div className="text-center">
            <a
              href="/login"
              className="text-caption text-muted hover:text-foreground underline underline-offset-4 transition-colors"
            >
              Venue and staff login
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
