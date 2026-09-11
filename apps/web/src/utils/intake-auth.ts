/**
 * Request authentication for /api/intake/*, which serves two very different
 * callers: the console (browser, cookie session) and the HappiTime app
 * (React Native, no cookies — it holds a Supabase access token).
 *
 * The bearer path builds an anon-key client and puts the user's JWT in the
 * Authorization header. Note the split: apikey stays the anon key, the JWT
 * only ever rides in Authorization. Conflating the two is what broke
 * verify-checkin with 401s in #143.
 */
import type { NextRequest } from 'next/server';
import {
  createClient as createSupaClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { getPublicSupabaseEnv } from '@happitime/shared-env';
import { createClient } from '@/utils/supabase/server';

export type IntakeCaller = { supabase: SupabaseClient; user: User };

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? '';
  if (!/^bearer\s+/i.test(header)) return null;
  const token = header.replace(/^bearer\s+/i, '').trim();
  return token.length > 0 ? token : null;
}

/** Resolves the caller from a bearer token if present, else the cookie session. */
export async function authenticateIntakeRequest(req: NextRequest): Promise<IntakeCaller | null> {
  const token = bearerToken(req);
  if (token) {
    const { url, anonKey } = getPublicSupabaseEnv();
    const supabase = createSupaClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { supabase, user: data.user };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { supabase: supabase as unknown as SupabaseClient, user: data.user };
}
