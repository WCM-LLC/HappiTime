import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@happitime/shared-env";

export function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
