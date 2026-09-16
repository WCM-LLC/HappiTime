import Link from 'next/link';
import { describeAuthError } from '@/utils/auth-error-copy.mjs';
import { loginPathFor, safeNextPath } from '@/utils/auth-paths';

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const copy = describeAuthError(sp?.message);
  const next = safeNextPath(sp?.next);
  const tryAgainHref = loginPathFor(next);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Link href={tryAgainHref} className="inline-block">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 439 148" className="h-8" aria-label="HappiTime" role="img">
              <circle cx="260.2" cy="74.0" r="47.9" fill="#C8965A" />
              <text x="30" y="93.0" fontFamily="var(--font-display), 'Plus Jakarta Sans', sans-serif" fontWeight="800" fontSize="72" letterSpacing="-0.02em">
                <tspan fill="#1A1A1A">Happ</tspan><tspan fill="#ffffff">iTi</tspan><tspan fill="#1A1A1A">me</tspan>
              </text>
            </svg>
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-heading-lg font-bold text-foreground tracking-tight">{copy.title}</h1>
          <p className="text-body-sm text-muted mt-2 leading-relaxed">{copy.body}</p>

          {copy.showConfigHelp ? (
            <div className="rounded-md border border-border bg-background p-4 mt-5">
              <p className="text-body-sm font-medium text-foreground mb-3">For the HappiTime admin:</p>
              <ol className="text-body-sm text-muted space-y-2 list-decimal pl-5">
                <li>In Supabase Dashboard &rarr; Authentication &rarr; URL Configuration, add this site URL.</li>
                <li>In Authentication &rarr; Redirect URLs, allow <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">/auth/callback**</code> for this host.</li>
              </ol>
            </div>
          ) : null}

          <div className="mt-6 flex justify-center">
            <Link
              href={tryAgainHref}
              className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Try again
            </Link>
          </div>

          {copy.detail ? (
            <details className="mt-6 group">
              <summary className="text-caption text-muted-light cursor-pointer select-none hover:text-muted">
                Technical details
              </summary>
              <p className="text-caption text-muted mt-2 break-words font-mono leading-relaxed">{copy.detail}</p>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
