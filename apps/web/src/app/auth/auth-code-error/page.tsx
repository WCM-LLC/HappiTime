import Link from 'next/link';

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Link href="/login" className="inline-block">
            <span className="text-heading-md font-bold text-foreground tracking-tight">
              Happi<span className="text-brand">Time</span>
            </span>
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <div className="rounded-md border border-error bg-error-light px-4 py-3 mb-5">
            <p className="text-body-sm font-medium text-error">Login failed</p>
            <p className="text-body-sm text-error/80 mt-0.5">
              This usually means your OAuth redirect URL is not allow-listed in Supabase Auth settings.
            </p>
          </div>

          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-body-sm font-medium text-foreground mb-3">To fix this:</p>
            <ol className="text-body-sm text-muted space-y-2 list-decimal pl-5">
              <li>In Supabase Dashboard &rarr; Authentication &rarr; URL Configuration, add your site URL.</li>
              <li>In Authentication &rarr; Redirect URLs, allow <code className="text-caption bg-surface px-1.5 py-0.5 rounded border border-border">/auth/callback</code> for local + prod.</li>
              <li>Try logging in again.</li>
            </ol>
          </div>

          <div className="mt-5 text-center">
            <Link href="/login">
              <span className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-brand text-white text-body-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer">
                Back to login
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
