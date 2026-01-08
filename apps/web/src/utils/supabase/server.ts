// src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupaClient, SupabaseClient } from '@supabase/supabase-js';

type ServiceRoleKeyError = 'missing' | 'invalid';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1];
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getServiceRoleKeyError(): ServiceRoleKeyError | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return 'missing';
  const payload = decodeJwtPayload(key);
  if (!payload || payload.role !== 'service_role') return 'invalid';
  return null;
}

export async function createClient() {
  const cookieStore = await cookies(); // ✅ Next.js 15: cookies() is async

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: any; value: any; options: any; }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // If called from a Server Component (not a Route Handler/Server Action),
            // Next may disallow setting cookies. Safe to ignore here.
          }
        },
      },
    }
  );
}

export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials in environment variables');
  }

  return createSupaClient(url, key, { auth: { persistSession: false } });
}
