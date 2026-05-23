'use client';

import { useState } from 'react';
import { safeNextPath } from '@/utils/auth-paths';
import { createClient } from '@/utils/supabase/client';

type Provider = 'google' | 'apple';

type OAuthButtonsProps = {
  next?: string;
  providers?: Provider[];
};

const PROVIDER_LABEL: Record<Provider, string> = {
  apple: 'Log in with Apple',
  google: 'Log in with Google',
};

const PROVIDER_BUSY_LABEL: Record<Provider, string> = {
  apple: 'Redirecting...',
  google: 'Redirecting...',
};

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === 'apple') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 26" aria-hidden="true" className="shrink-0" fill="currentColor">
        <path d="M16.37 1.43c0 1.02-.42 2.01-1.12 2.75-.76.8-1.77 1.27-2.75 1.18-.12-.98.36-2 .99-2.7.72-.8 1.93-1.37 2.88-1.23Zm3.94 16.76c-.6 1.36-.89 1.96-1.66 3.16-1.08 1.65-2.6 3.7-4.48 3.72-1.67.02-2.1-1.08-4.37-1.07-2.27.01-2.75 1.1-4.42 1.08-1.88-.02-3.32-1.86-4.4-3.51-3.02-4.63-3.34-10.06-1.48-12.94 1.32-2.05 3.41-3.25 5.37-3.25 2 0 3.26 1.1 4.92 1.1 1.61 0 2.59-1.1 4.91-1.1 1.75 0 3.61.95 4.92 2.6-4.32 2.37-3.62 8.54.69 10.21Z" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function OAuthButtons({ next, providers = ['google'] }: OAuthButtonsProps) {
  const [busy, setBusy] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    setBusy(provider);
    try {
      const supabase = await createClient();
      const origin = window.location.origin.replace(/\/+$/, '');
      const callbackUrl = new URL('/auth/callback', origin);
      const safeNext = safeNextPath(next);
      if (safeNext) callbackUrl.searchParams.set('next', safeNext);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        console.error(error);
        alert(error.message);
        setBusy(null);
        return;
      }

      if (!data?.url) {
        alert(`Unable to start ${provider} login. Please try again.`);
        setBusy(null);
        return;
      }

      window.location.assign(data.url);
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? `Unable to start ${provider} login.`);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((provider) => (
        <button
          type="button"
          key={provider}
          onClick={() => signIn(provider)}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-3 h-10 w-full px-4 rounded-md border border-border bg-surface text-foreground text-body-sm font-medium hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <ProviderIcon provider={provider} />
          {busy === provider ? PROVIDER_BUSY_LABEL[provider] : PROVIDER_LABEL[provider]}
        </button>
      ))}
    </div>
  );
}
