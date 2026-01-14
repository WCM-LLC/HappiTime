// packages/shared-api/src/client.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@happitime/shared-types";
import { getPublicSupabaseEnv } from "@happitime/shared-env";

/**
 * Create a Supabase client using the shared Database type.
 *
 * NOTE:
 * - On web: expect NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - On mobile: expect EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
 */
export function createSupabaseClient(options?: {
  supabaseUrl?: string;
  supabaseKey?: string;
  clientOptions?: Parameters<typeof createClient>[2];
}) {
  const { url, anonKey } = getPublicSupabaseEnv({
    supabaseUrl: options?.supabaseUrl,
    supabaseKey: options?.supabaseKey,
  });

  return createClient<Database>(url, anonKey, options?.clientOptions as any);
}
