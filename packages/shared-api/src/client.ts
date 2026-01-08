// packages/shared-api/src/client.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@happitime/shared-types";

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
}) {
  const supabaseUrl =
    options?.supabaseUrl ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    options?.supabaseKey ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase URL or anon key missing. Set EXPO_PUBLIC_SUPABASE_URL/ANON_KEY or NEXT_PUBLIC_SUPABASE_URL/ANON_KEY."
    );
  }

  return createClient<Database>(supabaseUrl, supabaseKey);
}
