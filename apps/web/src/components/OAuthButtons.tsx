'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type Provider = 'google' | 'apple' | 'facebook' | 'twitter';

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'apple', label: 'Continue with Apple' },
  { id: 'facebook', label: 'Continue with Facebook' },
  { id: 'twitter', label: 'Continue with X (Twitter)' },
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
    <div className="col">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          className="secondary"
          onClick={() => signIn(p.id)}
          disabled={busy !== null}
        >
          {busy === p.id ? 'Redirecting…' : p.label}
        </button>
      ))}
      <p className="muted" style={{ marginTop: 0 }}>
        Note: Supabase supports many OAuth providers, but Instagram isn&apos;t a built-in auth provider.
        If you truly need “Login with Instagram”, use a third-party auth provider (Auth0/Clerk/etc.) and
        connect it via “Third-party auth”, or treat Instagram as a data integration instead.
      </p>
    </div>
  );
}
