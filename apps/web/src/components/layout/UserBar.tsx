'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function UserBar() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="max-w-[var(--width-content)] mx-auto flex items-center justify-between h-14 px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-heading-md font-bold text-foreground tracking-tight">
            Happi<span className="text-brand">Time</span>
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <span className="text-body-sm text-muted hidden sm:inline">{email ?? 'Signed in'}</span>
          <button
            onClick={signOut}
            className="inline-flex items-center justify-center h-8 px-3 rounded-md text-caption font-medium text-muted hover:text-foreground hover:bg-background border border-border transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
