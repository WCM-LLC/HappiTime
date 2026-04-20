'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type Provider = 'google' | 'apple';

const PROVIDERS: { id: Provider; label: string; icon: string }[] = [
  { id: 'google', label: 'Continue with Google', icon: 'G' },
  { id: 'apple', label: 'Continue with Apple', icon: '' },
];

export default function OAuthButtons() {
  const [busy, setBusy] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    setBusy(provider);
    const supabase = await createClient();
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });

    if (error) {
      console.error(error);
      alert(error.message);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          onClick={() => signIn(p.id)}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-3 h-10 w-full px-4 rounded-md border border-border bg-surface text-foreground text-body-sm font-medium hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <span className="w-5 text-center text-body-sm font-semibold opacity-60">{p.icon}</span>
          {busy === p.id ? 'Redirecting…' : p.label}
        </button>
      ))}
    </div>
  );
}
