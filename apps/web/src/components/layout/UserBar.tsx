'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { resetAnalytics } from '@/services/analytics';
import { Logo } from '@/components/ui/Logo';

export default function UserBar() {
  const [email, setEmail] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    // Cosmetic only — /admin is enforced server-side by its layout. This just
    // stops advertising a console the signed-in user cannot open.
    supabase.rpc('is_happitime_admin').then(({ data }) => setIsPlatformAdmin(data === true));
    // Cosmetic as well — Super User pages are gated in middleware; this only
    // decides whether the Super User nav is shown.
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(({ data: profile }) => setIsSuperUser((profile as any)?.role === 'super_user'));
    });
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    resetAnalytics(); // unlink the device from the user before the next session
    window.location.href = '/login';
  }

  const initial = email ? email.charAt(0).toUpperCase() : '?';
  const isAdmin = pathname?.startsWith('/admin');
  const isDashboard = !isAdmin;

  const navLinkBase =
    'px-3 py-1.5 rounded-md text-body-sm font-medium transition-colors duration-fast';
  const navActive = `${navLinkBase} bg-background text-foreground`;
  const navInactive = `${navLinkBase} text-muted hover:text-foreground hover:bg-background`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/90 backdrop-blur-md">
      <div className="max-w-[var(--width-content)] mx-auto flex items-center justify-between h-14 px-6 gap-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center shrink-0">
          <Logo height={26} />
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {isSuperUser ? (
            <>
              <Link href="/dashboard" className={pathname === '/dashboard' ? navActive : navInactive}>
                Home
              </Link>
              <Link href="/dashboard/guides" className={pathname?.startsWith('/dashboard/guides') ? navActive : navInactive}>
                Guides
              </Link>
              <Link href="/dashboard/metrics" className={pathname?.startsWith('/dashboard/metrics') ? navActive : navInactive}>
                Metrics
              </Link>
              <Link href="/dashboard/referrals" className={pathname?.startsWith('/dashboard/referrals') ? navActive : navInactive}>
                My QR
              </Link>
              <Link href="/dashboard/events" className={`${pathname?.startsWith('/dashboard/events') ? navActive : navInactive} hidden sm:inline-flex`}>
                Events
              </Link>
            </>
          ) : (
            <Link href="/dashboard" className={isDashboard ? navActive : navInactive}>
              Dashboard
            </Link>
          )}
          {isPlatformAdmin ? (
            <Link href="/admin" className={isAdmin ? navActive : navInactive}>
              Admin
            </Link>
          ) : null}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-body-sm text-muted hidden md:inline truncate max-w-[180px]">
            {email ?? ''}
          </span>
          <Link
            href="/change-password"
            className="hidden sm:inline-flex items-center justify-center h-8 px-3 rounded-md text-caption font-medium text-muted hover:text-foreground hover:bg-background border border-border transition-colors"
          >
            Change password
          </Link>
          <button
            onClick={signOut}
            className="inline-flex items-center justify-center h-8 px-3 rounded-md text-caption font-medium text-muted hover:text-foreground hover:bg-background border border-border transition-colors cursor-pointer"
          >
            Sign out
          </button>
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-brand-subtle flex items-center justify-center shrink-0 select-none">
            <span className="text-caption font-bold text-brand-dark-alt">{initial}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
