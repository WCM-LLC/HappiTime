'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Logo } from '@/components/ui/Logo';

export default function UserBar() {
  const [email, setEmail] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
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
          <Link href="/dashboard" className={isDashboard ? navActive : navInactive}>
            Dashboard
          </Link>
          <Link href="/admin" className={isAdmin ? navActive : navInactive}>
            Admin
          </Link>
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
