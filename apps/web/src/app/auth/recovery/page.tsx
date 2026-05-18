'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

function safeNext(value: string | null): string {
  return value?.startsWith('/') ? value : '/reset-password';
}

function readParams() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return { query, hash };
}

export default function AuthRecoveryPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finishRecovery() {
      const supabase = createClient();
      const { query, hash } = readParams();
      const next = safeNext(query.get('next') ?? hash.get('next'));
      const queryError = query.get('error_description') ?? query.get('error');
      const hashError = hash.get('error_description') ?? hash.get('error');

      if (queryError || hashError) {
        setError(queryError ?? hashError ?? 'That password reset link could not be used.');
        return;
      }

      const code = query.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        if (!cancelled) router.replace(next);
        return;
      }

      const tokenHash = query.get('token_hash');
      const type = query.get('type');
      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'recovery' | 'email' | 'magiclink' | 'invite' | 'email_change',
        });
        if (verifyError) throw verifyError;
        if (!cancelled) router.replace(next);
        return;
      }

      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
        if (!cancelled) router.replace(next);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (!cancelled) router.replace(next);
        return;
      }

      setError('That password reset link is missing its recovery token. Please request a new link.');
    }

    finishRecovery().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'That password reset link could not be used.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
        <p className="text-body-sm font-semibold text-foreground">
          {error ? 'Password reset link problem' : 'Opening password reset...'}
        </p>
        <p className="text-body-sm text-muted mt-2">
          {error ?? 'Hang tight while we verify your link.'}
        </p>
        {error ? (
          <a
            href="/forgot-password"
            className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-dark text-dark-foreground text-body-sm font-medium hover:bg-dark/90 transition-colors mt-4"
          >
            Send a new link
          </a>
        ) : null}
      </div>
    </main>
  );
}
