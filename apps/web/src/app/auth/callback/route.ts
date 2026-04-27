import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type'); // e.g. 'recovery', 'signup', 'magiclink'
  const errorCode = searchParams.get('error_code');
  const errorDescription = searchParams.get('error_description');
  const errorMessage = searchParams.get('error');

  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get('next') ?? '/';

  if (!next.startsWith('/')) {
    next = '/';
  }

  // Password recovery flows should always land on the reset page
  if (type === 'recovery') {
    next = '/reset-password';
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectToNext(request, origin, next);
    }
    return redirectToAuthError(origin, error.message);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'recovery' | 'email' | 'magiclink' | 'invite' | 'email_change',
      token_hash: tokenHash,
    });
    if (!error) {
      return redirectToNext(request, origin, next);
    }
    return redirectToAuthError(origin, error.message);
  }

  if (errorCode || errorDescription || errorMessage) {
    const detail = [errorCode, errorDescription, errorMessage].filter(Boolean).join(': ');
    return redirectToAuthError(origin, detail);
  }

  // return the user to an error page with instructions
  return redirectToAuthError(origin);
}

function redirectToNext(request: Request, origin: string, next: string) {
  const forwardedHost = request.headers.get('x-forwarded-host'); // original origin before load balancer
  const isLocalEnv = process.env.NODE_ENV === 'development';

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function redirectToAuthError(origin: string, detail?: string | null) {
  const message = (detail ?? '').trim();
  if (!message) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }
  return NextResponse.redirect(
    `${origin}/auth/auth-code-error?message=${encodeURIComponent(message)}`
  );
}
